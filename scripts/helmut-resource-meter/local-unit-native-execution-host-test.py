"""Pure host/pipe/DTO cases. No Docker, native child, database or engine starts."""
import copy
import base64
import builtins
import datetime
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import shutil
import subprocess
import types
import unittest
from unittest.mock import patch

FILE = Path(__file__).with_name('local-unit-native-execution-host.py')
spec = importlib.util.spec_from_file_location('execution_host', FILE)
M = importlib.util.module_from_spec(spec); spec.loader.exec_module(M)


class FakeStream:
    def __init__(self, fd):
        self.fd, self.closed = fd, False

    def fileno(self):
        return self.fd

    def close(self):
        self.closed = True


class FakeSelector:
    def __init__(self):
        self.rows = {}; self.closed = False

    def register(self, stream, events, data):
        self.rows[stream.fd] = types.SimpleNamespace(fd=stream.fd, fileobj=stream, data=data)

    def unregister(self, stream):
        del self.rows[stream.fd]

    def select(self, timeout):
        return [(v, None) for v in list(self.rows.values())]

    def close(self):
        self.closed = True


class FakePopen:
    def __init__(self, argv, **kwargs):
        self.pid = 75; self.returncode = None; self.argv = argv; self.options = kwargs
        self.stdin = FakeStream(12) if kwargs.get('stdin') == M.subprocess.PIPE else None
        self.stdout, self.stderr = FakeStream(10), FakeStream(11)

    def poll(self):
        return self.returncode

    def terminate(self):
        self.returncode = -15

    def kill(self):
        self.returncode = -9

    def wait(self, timeout=None):
        return self.returncode


class FakeChild:
    def __init__(self, argv=None, data=None, lifetime=None, deferred=False):
        self.argv = argv; self.data = data; self.deferred = deferred; self.output = [bytearray(), bytearray()]
        self.child = types.SimpleNamespace(poll=lambda: None)

    def tick(self):
        return False


def inventory_fixture_output(argv, rows):
    if argv[0] == 'ps':
        raw = '\n'.join(row['Id'] for row in rows)
    elif argv[:2] == ['inspect', '--format']:
        if argv[2] != M.GLOBAL_CONTAINER_FORMAT:
            raise AssertionError('unexpected synthetic global format')
        raw = '\n'.join(json.dumps({'Id': row['Id'], 'CgroupParent': row['HostConfig']['CgroupParent']}) for row in rows)
    else:
        raw = json.dumps([row for row in rows if row['Id'] in argv[1:]])
    return types.SimpleNamespace(stdout=raw)


class PureHost(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='helmut-host-pure-'); self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.real_host_user = M.host_user
        patch.object(M, 'host_user', lambda: None).start()
        self.nonce = 'a' * 32; self.case = self.base / self.nonce; self.case.mkdir(mode=0o700)
        (self.case / 'client').mkdir(mode=0o700)
        self.addCleanup(patch.stopall); patch.object(M, 'BASE', self.base).start()
        patch.object(M.subprocess, 'Popen', side_effect=AssertionError('pure-tests-no-process-start')).start()
        patch.object(M, 'docker_daemon_peer', lambda: None).start()
        self.config = {'nonce': self.nonce, 'repository': str(self.base / 'repo'), 'runtime': {'imageId': 'sha256:' + 'b' * 64},
                       'parent': 'helmut-meter-memorybudget-' + 'c' * 24, 'parentDevice': 1, 'parentInode': 2,
                       'nodePin': self.pin('/opt/original/bin/node'), 'actualSourceContainerId': 'd' * 64, 'sourceCodePins': [],
                       'executionHost': {'clientRuntimePins': [], 'ownerRuntimeBindings': [], 'postgrestPin': self.pin('/opt/original/postgrest')}, 'runtimeBindings': []}
        self.aliases = {k: self.pin('/opt/' + v) for k, v in [('owner', 'local-unit-native-owner.js'),
                     ('broker', 'local-unit-diagnostic-broker.js'), ('postgrest', 'postgrest-pinned')]}
        self.plan = {'nonce': self.nonce, 'volumes': {'ram': 'ram-own', 'run': 'run-own'}, 'aliasPins': self.aliases,
                     'sourceAliasMounts': [(str(self.case / k), v['path'], True) for k, v in self.aliases.items()],
                     'sourceOwnerRuntimeMounts': [], 'ownerRuntimeCopies': [],
                     'nodeMount': (self.config['nodePin']['path'], self.config['nodePin']['path'], True), 'clientRuntimeMounts': [], 'knownSetupContainerIds': [],
                     'clientPublicSourceMounts': [], 'pythonMount': ('/opt/python/bin/python3.12', '/opt/python/bin/python3.12', True)}
        self.plan['shutdownPolicyPins'] = M.shutdown_policy_pins()
        self.plan['sourceAliasMounts'] += [(str(self.case / 'owner-public' / ('close-source-%02d' % i)), pin['path'], True) for i, pin in enumerate(self.plan['shutdownPolicyPins'])]
        self.plan['dockerConfigDirectory'] = M.docker_config(self.case)
        self.mounts = [*self.plan['sourceAliasMounts'], self.plan['nodeMount']]
        self.native = types.SimpleNamespace(parent_path=lambda _: self.base / 'group')
        self.supervisor = types.SimpleNamespace(PYTHON=Path('/opt/python'))
        self.host = M.NativeExecutionHost(self.native, self.supervisor, self.config, self.case, {'helpers': {}}, 'd' * 64, self.mounts, self.plan)
        self.selection = {'operationId': 'localUnitDiagnostic-' + self.nonce, 'commandHash': 'e' * 64}
        self.host.selection = self.selection

    def test_shutdown_plan_has_exact_eight_separate_public_sources(self):
        pins = M.shutdown_policy_pins(); self.assertEqual(len(pins), 8)
        self.assertEqual(sum(p['bytes'] for p in pins), 75089)
        self.assertEqual([p['path'] for p in pins], ['/opt/postgrest-close-source-%02d' % i for i in range(8)])
        for changed in (pins[:-1], pins + [pins[0]], list(reversed(pins))):
            plan = copy.deepcopy(self.plan); plan['shutdownPolicyPins'] = changed
            with self.assertRaisesRegex(RuntimeError, 'owner-shutdown-policy-pins'):
                M.NativeExecutionHost(self.native, self.supervisor, self.config, self.case, {}, 'd' * 64, self.mounts, plan)

    def test_shutdown_sources_cannot_be_omitted_or_mounted_at_free_paths(self):
        for mutation in ('missing', 'source', 'writable'):
            plan = copy.deepcopy(self.plan); rows = plan['sourceAliasMounts']
            if mutation == 'missing': rows.pop()
            else:
                source, target, readonly = rows[-1]
                rows[-1] = ('/unbound/source' if mutation == 'source' else source, target, False if mutation == 'writable' else readonly)
            with self.assertRaisesRegex(RuntimeError, 'owner-shutdown-source-mount-plan'):
                M.NativeExecutionHost(self.native, self.supervisor, self.config, self.case, {}, 'd' * 64, self.mounts, plan)

    def remove_config(self):
        directory = self.case / 'docker-empty-config'
        if directory.exists():
            (directory / 'config.json').unlink(); directory.rmdir()

    def pin(self, path, raw=b'public-bytes'):
        return {'path': path, 'bytes': len(raw), 'sha256': M.sha(raw)}

    def public_sources(self):
        root = self.base / 'external'; jit = root / 'jit'; arch = root / 'architecture'; python = root / 'python'
        values = {'READER': root / 'readonly_ext4.py', 'LEGACY': root / 'worker-http-lock.py', 'JIT': jit,
                  'COPY_MANIFEST': root / 'COPIED_PGDATA_FILE_MANIFEST.SAFE.json', 'ARCH': arch, 'PYTHON': python}
        self.supervisor.__dict__.update(values)
        targets = [('reader', values['READER']), ('legacyHelper', values['LEGACY']), ('jitHelper', jit / 'restore_original_jit.py'),
                   ('copyManifest', values['COPY_MANIFEST']), ('originalBudgetRuntimePin', arch / 'native-budget-implementation-qualification-v2/runtime/RUNTIME.SAFE.json')]
        self.config['sources'] = []
        for key, p in [*targets, (None, jit / 'JIT_CLOSURE_PLAN.SAFE.json'), (None, python / 'bin/python3.12')]:
            p.parent.mkdir(parents=True, exist_ok=True); p.write_bytes(('public-' + p.name).encode())
            pin = self.pin(str(p), p.read_bytes()); self.config['sources'].append(pin)
            if key: self.config[key] = pin
        self.config['pythonExecutable'] = str(python / 'bin/python3.12')

    def request(self, stage='HOST_OBSERVE', body=None, seq=1):
        now = datetime.datetime.now(datetime.timezone.utc)
        return {'schema': 'helmut-local-unit-native-host-request/1', 'seq': seq, 'stage': stage, 'nonce': 'f' * 64,
                'selection': self.selection, 'issuedAtUTC': now.isoformat(timespec='milliseconds').replace('+00:00', 'Z'),
                'expiresAtUTC': (now + datetime.timedelta(seconds=2)).isoformat(timespec='milliseconds').replace('+00:00', 'Z'), 'body': body or {}}

    def observation(self, source=None):
        return {'observedAtUTC': M.utc(), 'source': source or {'synthetic': 'source'}, 'sourceService': None,
                'sourceContainerId': self.host.source_id, 'knownContainerIds': [self.host.source_id], 'ownerObservation': None}

    def test_import_has_no_process_or_docker_action(self):
        with patch.object(M.subprocess, 'Popen', side_effect=AssertionError('no starts')), patch.object(M.subprocess, 'run', side_effect=AssertionError('no commands')):
            scope = {'__file__': str(FILE), '__name__': 'pure_import'}
            exec(compile(FILE.read_bytes(), str(FILE), 'exec'), scope)
            self.assertTrue(callable(scope['prepare_execution']))

    def test_unique_json_and_nonfinite_rejected(self):
        for raw in ('{"a":1,"a":2}', '{"x":NaN}', '{"a":{"x":1,"x":2}}'):
            with self.assertRaises((RuntimeError, ValueError)):
                M.unique(raw)

    def test_private_file_fresh_pin_and_no_replace(self):
        p = self.case / 'FILE.PRIVATE.json'; raw = b'{"safe":1}'
        ppin = M.write_once(p, raw)
        actual, read_pin = M.read_file(p, uid=os.getuid())
        self.assertTrue(actual == raw and ppin == read_pin)
        with self.assertRaises(FileExistsError):
            M.write_once(p, b'other')

    def test_atomic_reply_publication_never_replaces_or_adds_links(self):
        p = self.case / 'REPLY.PRIVATE.json'; M.publish_once(p, b'{"safe":1}')
        self.assertTrue(p.read_bytes() == b'{"safe":1}' and p.stat().st_nlink == 1)
        with self.assertRaises(OSError):
            M.publish_once(p, b'{"other":2}')
        self.assertTrue(p.read_bytes() == b'{"safe":1}')

    def test_private_symlink_hardlink_wrong_mode_rejected(self):
        p = self.case / 'target'; p.write_bytes(b'private'); p.chmod(0o600)
        q = self.case / 'link'; q.symlink_to(p)
        with self.assertRaises(RuntimeError):
            M.read_file(q, uid=os.getuid())
        q.unlink(); os.link(p, q)
        with self.assertRaises(RuntimeError):
            M.read_file(p, uid=os.getuid())
        q.unlink(); p.chmod(0o644)
        with self.assertRaises(RuntimeError):
            M.read_file(p, uid=os.getuid())

    def test_ipc_window_is_actual_and_three_seconds_bounded(self):
        r = self.request(); M.window(r)
        for a, b in [('2000-01-01T00:00:00.000Z', '2000-01-01T00:00:02.000Z'),
                     ('2100-01-01T00:00:00.000Z', '2100-01-01T00:00:02.000Z'),
                     (r['issuedAtUTC'], '2100-01-01T00:00:02.000Z')]:
            with self.assertRaises(RuntimeError):
                M.window({**r, 'issuedAtUTC': a, 'expiresAtUTC': b})

    def test_selection_is_actual_two_keys(self):
        r = self.request(); r['selection'] = {**self.selection, 'version': 'invented'}
        with self.assertRaises(RuntimeError):
            self.host._accept(r, '1' * 64)

    def test_scope_nonce_sequence_and_replay_rejected(self):
        for mutate in [lambda r: r.update(seq=True), lambda r: r.update(seq=2), lambda r: r.update(nonce='bad'),
                       lambda r: r['selection'].update(commandHash='0' * 64)]:
            r = copy.deepcopy(self.request()); mutate(r)
            with self.assertRaises(RuntimeError):
                self.host._accept(r, '1' * 64)
        self.host.seen.add('f' * 64)
        with self.assertRaises(RuntimeError):
            self.host._accept(self.request(), '1' * 64)

    def test_success_reply_binds_exact_request_scope_hash_and_nonce(self):
        self.host.state = 'QUALIFIED'; r = self.request(); self.host._observe = self.observation
        request_pin = M.write_once(self.case / 'HOST_REQUEST_01.PRIVATE.json', M.encode(r))
        self.host._accept(r, request_pin['sha256'])
        original_read = M.read_file
        with patch.object(M, 'read_file', lambda p, *a, **k: original_read(p, *a, **{**k, 'uid': os.getuid()})):
            self.host.tick()
        raw, _ = M.read_file(self.case / 'HOST_REPLY_01.PRIVATE.json', uid=os.getuid()); reply = M.unique(raw)
        self.assertTrue(set(reply) == {'schema', 'seq', 'stage', 'nonce', 'selection', 'requestSHA256', 'issuedAtUTC', 'expiresAtUTC', 'result'})
        self.assertTrue(reply['selection'] == self.selection and reply['nonce'] == r['nonce'] and reply['requestSHA256'] == request_pin['sha256'])
        M.window(reply); self.assertTrue(self.host.seq == 2 and self.host.pending is None)

    def test_queued_observation_is_admitted_then_freshly_measured_and_replied_in_one_tick(self):
        real_datetime = datetime.datetime
        epoch = real_datetime.now(datetime.timezone.utc)
        epoch = epoch.replace(microsecond=epoch.microsecond // 1000 * 1000)
        clock = {'seconds': 0.0}; phases = []
        class ClockDatetime(real_datetime):
            @classmethod
            def now(cls, tz=None):
                value = epoch + datetime.timedelta(seconds=clock['seconds'])
                return value.astimezone(tz) if tz else value.replace(tzinfo=None)
        original_read = M.read_file
        def read_as_synthetic_actor(path, *args, **kwargs):
            return original_read(path, *args, **{**kwargs, 'uid': os.getuid()})
        with (patch.object(M.datetime, 'datetime', ClockDatetime),
              patch.object(M.time, 'time', lambda: (epoch + datetime.timedelta(seconds=clock['seconds'])).timestamp()),
              patch.object(M.time, 'monotonic', lambda: 1000 + clock['seconds']),
              patch.object(M, 'read_file', read_as_synthetic_actor)):
            self.host.started_at = 1000
            for index, state in enumerate(('QUALIFIED', 'ENTRY', 'DONE'), 1):
                self.host.state = state
                self.host.last_observation = {'observedAtUTC': '2000-01-01T00:00:00.000Z', 'stale': True}
                request = self.request(seq=index); request['nonce'] = str(index) * 64
                request['expiresAtUTC'] = (ClockDatetime.now(datetime.timezone.utc) + datetime.timedelta(seconds=3)).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
                request_pin = M.write_once(self.case / ('HOST_REQUEST_%02d.PRIVATE.json' % index), M.encode(request))
                began = clock['seconds']
                def observe():
                    self.assertEqual(self.host.pending['request'], request)
                    self.assertIn(request['nonce'], self.host.seen)
                    phases.append(('fresh-observe', state))
                    clock['seconds'] += 1.8
                    return self.observation({'freshSequence': index})
                self.host._observe = observe
                with patch.object(self.host, '_accept', wraps=self.host._accept) as accept:
                    result = self.host.tick()
                reply = M.unique((self.case / ('HOST_REPLY_%02d.PRIVATE.json' % index)).read_bytes())
                self.assertEqual(accept.call_count, 1)
                self.assertEqual(reply['requestSHA256'], request_pin['sha256'])
                self.assertEqual(reply['nonce'], request['nonce'])
                self.assertEqual(reply['selection'], request['selection'])
                self.assertEqual(reply['result'], self.observation({'freshSequence': index}))
                M.window(reply)
                self.assertTrue(result['pending'] is None and self.host.seq == index + 1 and self.host.failure is None)
                self.assertLess(clock['seconds'] - began, 3)
                # The historical second 1.8s inventory plus supervisor pause
                # would already exceed the unchanged Source 3s call budget.
                self.assertGreater(2 * (clock['seconds'] - began) + .25, 3)
            self.assertEqual(phases, [('fresh-observe', s) for s in ('QUALIFIED', 'ENTRY', 'DONE')])

    def test_early_observation_pending_consumes_once_without_cached_reply(self):
        self.host.state = 'QUALIFIED'; request = self.request()
        M.write_once(self.case / 'HOST_REQUEST_01.PRIVATE.json', M.encode(request))
        previous = {'observedAtUTC': '2000-01-01T00:00:00.000Z', 'stale': True}
        self.host.last_observation = previous
        original_read = M.read_file
        with (patch.object(M, 'read_file', lambda p, *a, **k: original_read(p, *a, **{**k, 'uid': os.getuid()})),
              patch.object(self.host, '_accept', wraps=self.host._accept) as accept):
            self.host._observe = lambda: (_ for _ in ()).throw(M.ObservationPending())
            result = self.host.tick()
            self.assertTrue(result['observation'] is None and result['pending'] == 'HOST_OBSERVE')
            self.assertTrue(self.host.last_observation is previous and self.host.failure is None)
            self.assertFalse((self.case / 'HOST_REPLY_01.PRIVATE.json').exists())
            self.host._observe = lambda: self.observation({'fresh': True})
            self.host.tick()
            self.assertEqual(accept.call_count, 1)
        reply = M.unique((self.case / 'HOST_REPLY_01.PRIVATE.json').read_bytes())
        self.assertTrue(reply['result']['source']['fresh'] and 'stale' not in reply['result'])

    def test_queued_entry_with_bound_source_needs_one_fresh_inventory_before_five_second_reply(self):
        clock = {'seconds': 0.0}; phases = []; original_read = M.read_file
        real_datetime = datetime.datetime; epoch = real_datetime.now(datetime.timezone.utc)
        class ClockDatetime(real_datetime):
            @classmethod
            def now(cls, tz=None):
                value = epoch + datetime.timedelta(seconds=clock['seconds'])
                return value.astimezone(tz) if tz else value.replace(tzinfo=None)
        self.host.state = 'QUALIFIED'; self.host.source_identity = {'synthetic': 'already-bound-source'}
        self.host.started_at = self.host.observed_at = 1000
        request = self.request('ENTRY_START')
        request['issuedAtUTC'] = epoch.isoformat(timespec='milliseconds').replace('+00:00', 'Z')
        request['expiresAtUTC'] = (epoch + datetime.timedelta(seconds=3)).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
        request_pin = M.write_once(self.case / 'HOST_REQUEST_01.PRIVATE.json', M.encode(request))
        def client(mode):
            self.assertEqual(mode, 'entry'); phases.append('create-entry'); clock['seconds'] += .3
            self.host.active_client = 'synthetic-entry'
            self.host.clients['synthetic-entry'] = {'exitReleased': True}
        def observe():
            self.assertEqual(self.host.pending['request']['stage'], 'ENTRY_START')
            self.assertEqual(phases, ['create-entry']); phases.append('fresh-inventory')
            clock['seconds'] += 2.4
            return self.observation({'fresh': True})
        def release():
            self.assertEqual(phases, ['create-entry', 'fresh-inventory']); phases.append('release-gate')
            self.host.clients['synthetic-entry']['gateReleased'] = True
        with (patch.object(M.datetime, 'datetime', ClockDatetime),
              patch.object(M.time, 'time', lambda: (epoch + datetime.timedelta(seconds=clock['seconds'])).timestamp()),
              patch.object(M.time, 'monotonic', lambda: 1000 + clock['seconds']),
              patch.object(M, 'read_file', lambda p, *a, **k: original_read(p, *a, **{**k, 'uid': os.getuid()})),
              patch.object(self.host, '_client', client), patch.object(self.host, '_observe', observe),
              patch.object(self.host, '_release_clients', release)):
            result = self.host.tick()
        reply = M.unique((self.case / 'HOST_REPLY_01.PRIVATE.json').read_bytes())
        self.assertEqual(phases, ['create-entry', 'fresh-inventory', 'release-gate'])
        self.assertEqual(reply['requestSHA256'], request_pin['sha256'])
        self.assertEqual(reply['nonce'], request['nonce']); self.assertEqual(reply['selection'], self.selection)
        self.assertTrue(result['pending'] is None and self.host.seq == 2 and self.host.failure is None)
        self.assertLess(clock['seconds'], 5)
        self.assertGreater(.3 + 2 * 2.4, 5)

    def test_early_entry_still_requires_released_gate_and_complete_fresh_observation(self):
        original_read = M.read_file; self.host.state = 'QUALIFIED'
        self.host.source_identity = {'synthetic': 'already-bound-source'}; self.host.observed_at = M.time.monotonic()
        M.write_once(self.case / 'HOST_REQUEST_01.PRIVATE.json', M.encode(self.request('ENTRY_START')))
        def client(mode):
            self.assertEqual(mode, 'entry'); self.host.active_client = 'synthetic-entry'
            self.host.clients['synthetic-entry'] = {'exitReleased': True}
        with (patch.object(M, 'read_file', lambda p, *a, **k: original_read(p, *a, **{**k, 'uid': os.getuid()})),
              patch.object(self.host, '_client', side_effect=client) as create,
              patch.object(self.host, '_release_clients') as release):
            self.host._observe = lambda: (_ for _ in ()).throw(M.ObservationPending())
            self.host.tick()
            release.assert_not_called()
            self.assertFalse((self.case / 'HOST_REPLY_01.PRIVATE.json').exists())
            self.host._observe = lambda: self.observation({'fresh': True})
            self.host.tick()
            self.assertFalse((self.case / 'HOST_REPLY_01.PRIVATE.json').exists())
            self.host.clients['synthetic-entry']['gateReleased'] = True
            self.host.tick()
            self.assertEqual(create.call_count, 1)
        self.assertTrue((self.case / 'HOST_REPLY_01.PRIVATE.json').exists())

    def test_early_entry_preserves_envelope_replay_body_and_prior_observation_guards(self):
        original_read = M.read_file
        for label in ('expired', 'future', 'scope', 'sequence', 'nonce', 'body', 'replay', 'stale-observation'):
            host = M.NativeExecutionHost(self.native, self.supervisor, self.config, self.case, {'helpers': {}}, 'd' * 64, self.mounts, self.plan)
            host.state = 'QUALIFIED'; host.selection = self.selection; host.source_identity = {'synthetic': 'bound'}
            host.observed_at = M.time.monotonic(); request = copy.deepcopy(self.request('ENTRY_START'))
            if label == 'expired': request.update(issuedAtUTC='2000-01-01T00:00:00.000Z', expiresAtUTC='2000-01-01T00:00:03.000Z')
            elif label == 'future': request.update(issuedAtUTC='2100-01-01T00:00:00.000Z', expiresAtUTC='2100-01-01T00:00:03.000Z')
            elif label == 'scope': request['selection']['commandHash'] = '0' * 64
            elif label == 'sequence': request['seq'] = 2
            elif label == 'nonce': request['nonce'] = 'invalid'
            elif label == 'body': request['body'] = {'inventedAuthority': True}
            elif label == 'replay': host.seen.add(request['nonce'])
            elif label == 'stale-observation': host.observed_at -= 3.001
            path = self.case / 'HOST_REQUEST_01.PRIVATE.json'; M.write_once(path, M.encode(request))
            with (self.subTest(case=label), patch.object(M, 'read_file', lambda p, *a, **k: original_read(p, *a, **{**k, 'uid': os.getuid()})),
                  patch.object(host, '_observe', side_effect=AssertionError('no observation before invalid admission')),
                  patch.object(host, '_client', side_effect=AssertionError('no invalid entry start')),
                  self.assertRaisesRegex(RuntimeError, '^native-execution-host-sealed-failure$')):
                host.tick()
            self.assertFalse((self.case / 'HOST_REPLY_01.PRIVATE.json').exists())
            path.unlink(); (self.case / 'EXECUTION_HOST_FAILURE.PRIVATE.json').unlink()

    def test_early_observation_keeps_window_scope_sequence_nonce_body_and_replay_guards(self):
        original_read = M.read_file
        for label in ('expired', 'future', 'over-three-seconds', 'scope', 'sequence', 'nonce', 'body', 'replay'):
            host = M.NativeExecutionHost(self.native, self.supervisor, self.config, self.case, {'helpers': {}}, 'd' * 64, self.mounts, self.plan)
            host.state = 'QUALIFIED'; host.selection = self.selection
            request = copy.deepcopy(self.request())
            if label == 'expired': request.update(issuedAtUTC='2000-01-01T00:00:00.000Z', expiresAtUTC='2000-01-01T00:00:03.000Z')
            elif label == 'future': request.update(issuedAtUTC='2100-01-01T00:00:00.000Z', expiresAtUTC='2100-01-01T00:00:03.000Z')
            elif label == 'over-three-seconds': request['expiresAtUTC'] = '2100-01-01T00:00:00.000Z'
            elif label == 'scope': request['selection']['commandHash'] = '0' * 64
            elif label == 'sequence': request['seq'] = 2
            elif label == 'nonce': request['nonce'] = 'invalid'
            elif label == 'body': request['body'] = {'inventedAuthority': True}
            elif label == 'replay': host.seen.add(request['nonce'])
            path = self.case / 'HOST_REQUEST_01.PRIVATE.json'; M.write_once(path, M.encode(request))
            observed = []
            host._observe = lambda: observed.append('unexpected-measurement') or {'fresh': True}
            with (self.subTest(case=label), patch.object(M, 'read_file', lambda p, *a, **k: original_read(p, *a, **{**k, 'uid': os.getuid()})),
                  self.assertRaisesRegex(RuntimeError, '^native-execution-host-sealed-failure$')):
                host.tick()
            self.assertIsNotNone(host.failure)
            self.assertEqual(observed, [])
            self.assertFalse((self.case / 'HOST_REPLY_01.PRIVATE.json').exists())
            path.unlink(); (self.case / 'EXECUTION_HOST_FAILURE.PRIVATE.json').unlink()

    def test_other_stages_keep_intake_after_fresh_source_identity(self):
        original_read = M.read_file
        for stage, state, body in (('OWNER_START', 'INIT', {'handoff': {}}), ('ENTRY_START', 'QUALIFIED', {})):
            host = M.NativeExecutionHost(self.native, self.supervisor, self.config, self.case, {'helpers': {}}, 'd' * 64, self.mounts, self.plan)
            host.state = state; host.selection = self.selection; host.observed_at = M.time.monotonic(); phases = []
            request = self.request(stage, body)
            path = self.case / 'HOST_REQUEST_01.PRIVATE.json'; M.write_once(path, M.encode(request))
            def observe():
                self.assertIsNone(host.pending); phases.append('observe'); host.source_identity = {'synthetic': 'source'}
                return {'fresh': True}
            def action(*args):
                self.assertEqual(phases, ['observe']); self.assertIsNotNone(host.source_identity); phases.append('stage-action')
            host._observe = observe; host._handoff = action; host._client = action
            with patch.object(M, 'read_file', lambda p, *a, **k: original_read(p, *a, **{**k, 'uid': os.getuid()})):
                host.tick()
            self.assertEqual(phases, ['observe', 'stage-action'])
            self.assertEqual(host.pending['request']['stage'], stage)
            self.assertFalse((self.case / 'HOST_REPLY_01.PRIVATE.json').exists())
            path.unlink()

    def test_existing_pending_stage_does_not_consume_another_request_early(self):
        self.host.state = 'ENTRY'
        request = self.request('ENTRY_RESULT'); self.host._accept(request, '1' * 64)
        next_request = self.request(seq=2); next_request['nonce'] = '2' * 64
        M.write_once(self.case / 'HOST_REQUEST_02.PRIVATE.json', M.encode(next_request))
        self.host._observe = lambda: {'fresh': True}; self.host._client_result = lambda: None
        with patch.object(self.host, '_accept', wraps=self.host._accept) as accept:
            self.host.tick()
        self.assertEqual(accept.call_count, 0)
        self.assertNotIn(next_request['nonce'], self.host.seen)
        self.assertEqual(self.host.pending['request']['stage'], 'ENTRY_RESULT')

    def test_late_observation_uses_this_ticks_complete_sample_without_redating(self):
        self.host.state = 'QUALIFIED'; phases = []; actual = {}
        self.host.last_observation = self.observation({'stale': True})
        original_read, original_publish, original_accept = M.read_file, M.publish_observation_reply, self.host._accept
        monotonic = M.time.monotonic; offset = {'seconds': 0.0}
        def observe():
            self.assertIsNone(self.host.pending); phases.append('observe')
            request = self.request(); actual['request'] = request
            actual['requestPin'] = M.write_once(self.case / 'HOST_REQUEST_01.PRIVATE.json', M.encode(request))
            actual['observation'] = self.observation({'currentSample': True})
            return actual['observation']
        def accept(*args):
            phases.append('accept'); return original_accept(*args)
        def publish(*args):
            phases.append('publish'); actual['sample'] = args[-1].copy()
            offset['seconds'] += .2  # Pure publication latency; no actual wait.
            return original_publish(*args)
        self.host._observe = observe
        with (patch.object(M, 'read_file', lambda p, *a, **k: original_read(p, *a, **{**k, 'uid': os.getuid()})),
              patch.object(M.time, 'monotonic', lambda: monotonic() + offset['seconds']),
              patch.object(self.host, '_accept', accept), patch.object(M, 'publish_observation_reply', publish)):
            result = self.host.tick()
            self.assertGreaterEqual(M.time.monotonic() - self.host.observed_at, .2)
        reply = M.unique((self.case / 'HOST_REPLY_01.PRIVATE.json').read_bytes())
        self.assertEqual(phases, ['observe', 'accept', 'publish'])
        self.assertEqual(reply['requestSHA256'], actual['requestPin']['sha256'])
        self.assertEqual(reply['result'], actual['observation'])
        self.assertEqual(set(reply['result']), {'observedAtUTC', 'source', 'sourceService', 'sourceContainerId', 'knownContainerIds', 'ownerObservation'})
        self.assertEqual(self.host.observed_at, actual['sample']['completedMonotonic'])
        self.assertTrue(self.host.pending is None and self.host.seq == 2 and result['observation'] is actual['observation'])

    def test_late_pending_sample_never_replies_or_uses_last_observation(self):
        self.host.state = 'QUALIFIED'; previous = self.observation({'stale': True})
        self.host.last_observation = previous
        def pending():
            M.write_once(self.case / 'HOST_REQUEST_01.PRIVATE.json', M.encode(self.request()))
            raise M.ObservationPending()
        self.host._observe = pending
        result = self.host.tick()
        self.assertTrue(result['observation'] is None and self.host.last_observation is previous and self.host.pending is None)
        self.assertFalse(self.host.seen or (self.case / 'HOST_REPLY_01.PRIVATE.json').exists())

    def test_observation_transport_core_denies_stale_future_pending_and_unbound_values(self):
        start = M.observation_sample_start(); request = self.request()
        pin = M.write_once(self.case / 'HOST_REQUEST_01.PRIVATE.json', M.encode(request))
        observation = self.observation(); sample = M.observation_sample_complete(start); original_read = M.read_file
        for label in ('stale', 'future-completion', 'nonfinite', 'before-request', 'pending', 'extra-result', 'sha', 'selection'):
            value = copy.deepcopy(observation); marker = sample.copy(); selection = self.selection; request_sha = pin['sha256']
            if label == 'stale': marker['startedMonotonic'] -= 3.01
            elif label == 'future-completion': marker['completedMonotonic'] += 4
            elif label == 'nonfinite': marker['startedMonotonic'] = float('nan')
            elif label == 'before-request':
                marker['startedMonotonic'] -= 2
                marker['startedAtUTC'] = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(seconds=2)).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
                value['observedAtUTC'] = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(seconds=1)).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
            elif label == 'pending': value = None
            elif label == 'extra-result': value['inventedAuthority'] = True
            elif label == 'sha': request_sha = '0' * 64
            elif label == 'selection': selection = {**selection, 'commandHash': '0' * 64}
            with (self.subTest(case=label), patch.object(M, 'read_file', lambda p, *a, **k: original_read(p, *a, **{**k, 'uid': os.getuid()})),
                  self.assertRaises(RuntimeError)):
                M.publish_observation_reply(self.case, request, request_sha, selection, value, marker)
            self.assertFalse((self.case / 'HOST_REPLY_01.PRIVATE.json').exists())

    def test_observation_transport_publication_rechecks_original_deadlines_after_fsync(self):
        original_read, original_write, mono, wall = M.read_file, M.write_once, M.time.monotonic, M.time.time
        for kind in ('stale', 'expired'):
            folder = self.case / ('channel-' + kind); folder.mkdir(mode=0o700)
            start = M.observation_sample_start(); request = self.request()
            pin = M.write_once(folder / 'HOST_REQUEST_01.PRIVATE.json', M.encode(request))
            observation = self.observation(); sample = M.observation_sample_complete(start); delay = {'seconds': 0.0}
            def write(path, raw, mode=0o600):
                result = original_write(path, raw, mode)
                if Path(path).name.startswith('.HOST_REPLY_'): delay['seconds'] = 3.01
                return result
            with (self.subTest(kind=kind), patch.object(M, 'read_file', lambda p, *a, **k: original_read(p, *a, **{**k, 'uid': os.getuid()})),
                  patch.object(M, 'write_once', write),
                  patch.object(M.time, 'monotonic', lambda: mono() + (delay['seconds'] if kind == 'stale' else 0)),
                  patch.object(M.time, 'time', lambda: wall() + (delay['seconds'] if kind == 'expired' else 0)),
                  self.assertRaises(RuntimeError)):
                M.publish_observation_reply(folder, request, pin['sha256'], self.selection, observation, sample)
            self.assertFalse((folder / 'HOST_REPLY_01.PRIVATE.json').exists())

    def test_observation_transport_rechecks_request_bytes_and_never_replaces_reply(self):
        start = M.observation_sample_start(); request = self.request()
        path = self.case / 'HOST_REQUEST_01.PRIVATE.json'; pin = M.write_once(path, M.encode(request))
        observation = self.observation(); sample = M.observation_sample_complete(start); original_read = M.read_file
        with patch.object(M, 'read_file', lambda p, *a, **k: original_read(p, *a, **{**k, 'uid': os.getuid()})):
            reply_pin = M.publish_observation_reply(self.case, request, pin['sha256'], self.selection, observation, sample)
            before = Path(reply_pin['path']).read_bytes()
            with self.assertRaises(OSError):
                M.publish_observation_reply(self.case, request, pin['sha256'], self.selection, observation, sample)
            self.assertEqual(Path(reply_pin['path']).read_bytes(), before)
            path.write_bytes(M.encode({**request, 'nonce': 'a' * 64}))
            with self.assertRaisesRegex(RuntimeError, 'observation-request-file-drift'):
                M.publish_observation_reply(self.case, request, pin['sha256'], self.selection, observation, sample)

    def test_observation_transport_deadline_is_checked_after_request_fd_read(self):
        start = M.observation_sample_start(); request = self.request()
        pin = M.write_once(self.case / 'HOST_REQUEST_01.PRIVATE.json', M.encode(request))
        observation = self.observation(); sample = M.observation_sample_complete(start)
        original_read, wall = M.read_file, M.time.time; clock = {'reads': 0, 'delay': 0.0}
        def read(path, *args, **kwargs):
            result = original_read(path, *args, **{**kwargs, 'uid': os.getuid()})
            clock['reads'] += 1
            if clock['reads'] == 2: clock['delay'] = 2.1
            return result
        with (patch.object(M, 'read_file', read), patch.object(M.time, 'time', lambda: wall() + clock['delay']),
              self.assertRaisesRegex(RuntimeError, 'private-ipc-window')):
            M.publish_observation_reply(self.case, request, pin['sha256'], self.selection, observation, sample)
        self.assertEqual(clock['reads'], 2)
        self.assertFalse((self.case / 'HOST_REPLY_01.PRIVATE.json').exists())

    def test_host_observation_is_allowed_while_entry_live(self):
        self.host.state = 'ENTRY'; self.host._observe = lambda: {'metadata': 1}
        self.host._accept(self.request(), '1' * 64)
        self.assertTrue(self.host.state == 'ENTRY')

    def test_entry_requires_new_observation_and_qualifier(self):
        self.host._client = lambda _: None
        for state, age in [('INIT', 0), ('OWNER', 0), ('QUALIFIED', 4), ('ENTRY', 0)]:
            self.host.state = state; self.host.observed_at = M.time.monotonic() - age
            with self.assertRaises(RuntimeError):
                self.host._accept(self.request('ENTRY_START'), '1' * 64)
            self.host.seen.clear(); self.host.pending = None

    def test_no_seed_stage_or_arbitrary_sql_stage(self):
        for stage in ('SEED', 'SQL', 'RETRY', 'OWNER_START_AGAIN'):
            self.host.seen.clear()
            with self.assertRaises(RuntimeError):
                self.host._accept(self.request(stage), '1' * 64)

    def test_readonly_http_owner_stop_only_after_qualified_and_no_entry(self):
        self.config['nativeDiagnosticMode'] = 'readonly-http-pre-admission-v1'
        owner = {'pid': 12, 'startTicks': '34', 'exe': '/node', 'pidNamespace': 'pid:[1]'}
        self.host.heartbeat = {'owner': owner}; actions = []
        self.host._root = lambda code, data: actions.append((code, data))
        self.host.state = 'QUALIFIED'; self.host._accept(self.request('OWNER_STOP'), '1' * 64)
        self.assertEqual(actions, [(M.ROOT_SIGNAL, owner)])
        self.assertEqual(self.host.state, 'QUALIFIED')  # Actual close still required; never fake DONE.
        for stage, state in (('ENTRY_START', 'QUALIFIED'), ('ENTRY_RESULT', 'ENTRY')):
            self.host.pending = None; self.host.seen.clear(); self.host.state = state
            self.host.observed_at = M.time.monotonic()
            with self.subTest(stage=stage), self.assertRaisesRegex(RuntimeError, 'readonly-http-no-entry'):
                self.host._accept(self.request(stage), '1' * 64)
        with self.assertRaisesRegex(RuntimeError, 'readonly-http-no-entry'): self.host._client('entry')
        for diagnostic, state in ((None, 'QUALIFIED'), ('fresh-claim-only-v1', 'QUALIFIED'),
                                  ('readonly-http-pre-admission-v1', 'INIT'), ('readonly-http-pre-admission-v1', 'OWNER')):
            self.config['nativeDiagnosticMode'] = diagnostic; self.host.pending = None; self.host.seen.clear(); self.host.state = state
            with self.subTest(diagnostic=diagnostic, state=state), self.assertRaisesRegex(RuntimeError, 'owner-stop-order'):
                self.host._accept(self.request('OWNER_STOP'), '1' * 64)

    def closed_phase_child(self, raw=b'private-marker\n'):
        close = {'exitCode': 0, 'stdoutNaturalEOF': True, 'stderrNaturalEOF': True, 'registeredHostPID': 123}
        return types.SimpleNamespace(close_metadata=lambda: copy.deepcopy(close), output=[bytearray(b'private-stdout'), bytearray(raw)],
            transport_failure=None, capture_error=None, capture_truncated=[False, False],
            tick=lambda: True, child=types.SimpleNamespace(poll=lambda: 0)), close

    def test_readonly_http_private_stderr_published_once_without_stdout_or_base64(self):
        self.config['nativeDiagnosticMode'] = 'readonly-http-pre-admission-v1'
        child, close = self.closed_phase_child()
        capture = self.host._readonly_http_capture('ENDPOINT', child, close, 'c' * 64)
        path = Path(capture['pin']['path'])
        self.assertEqual(path.read_bytes(), b'private-marker\n'); self.assertEqual(path.stat().st_mode & 0o777, 0o600)
        self.assertEqual(capture['pin'], self.pin(str(path), path.read_bytes()))
        self.assertEqual(set(capture), {'pin', 'processClose', 'containerId'}); self.assertEqual(capture['processClose'], close)
        self.assertNotIn('private-marker', json.dumps(capture)); self.assertNotIn('private-stdout', json.dumps(capture))
        with self.assertRaises(FileExistsError): self.host._readonly_http_capture('ENDPOINT', child, close, 'c' * 64)
        self.assertEqual(path.read_bytes(), b'private-marker\n')

    def test_readonly_http_capture_rejects_incomplete_close_truncation_cap_or_other_mode(self):
        for fault in ('mode', 'exit', 'eof', 'transport', 'capture', 'truncated', 'cap', 'mismatch'):
            self.config['nativeDiagnosticMode'] = 'readonly-http-pre-admission-v1'
            child, close = self.closed_phase_child()
            if fault == 'mode': self.config['nativeDiagnosticMode'] = 'fresh-claim-only-v1'
            if fault == 'exit': close['exitCode'] = 1
            if fault == 'eof': close['stderrNaturalEOF'] = False
            if fault == 'transport': child.transport_failure = {'type': 'Error'}
            if fault == 'capture': child.capture_error = {'type': 'Error'}
            if fault == 'truncated': child.capture_truncated[1] = True
            if fault == 'cap': child.output[1] = bytearray(128 * 1024 + 1)
            if fault == 'mismatch': close = {**close, 'registeredHostPID': 999}
            with self.subTest(fault=fault), self.assertRaises(RuntimeError):
                self.host._readonly_http_capture('BROKER', child, close, self.host.source_id)
            self.assertFalse((self.case / 'READONLY_HTTP_BROKER_PHASES.PRIVATE.log').exists())

    def test_readonly_http_owner_pass_capture_requires_actual_closed_trace(self):
        h = self.host; self.config['nativeDiagnosticMode'] = 'readonly-http-pre-admission-v1'
        h.state = 'QUALIFIED'; h.owner, close = self.closed_phase_child(b'broker-marker\n')
        h.heartbeat = {'owner': {'pid': 12, 'startTicks': '34', 'exe': '/node', 'pidNamespace': 'pid:[1]'}}
        h.owner_ready = {'ownerPID': 12, 'ownerStartTicks': '34'}
        h.source_identity = {'namespaces': {'pid': 'pid:[1]', 'time': 'time:[2]', 'clockDomain': {'test': 'clock'}}}
        h.qualifier_report = {'rootTrustSHA256': 'a' * 64, 'publicSourceBindingCanonicalSHA256': 'b' * 64}
        h.owner_stop = {'cleanShutdown': True, 'failed': False}
        trace = {'value': {'header': {**self.selection, 'ownerPID': 12, 'ownerStartTicks': '34',
            'pidNamespace': 'pid:[1]', 'timeNamespace': 'time:[2]', 'clockDomain': {'test': 'clock'},
            'brokerCodeSHA256': self.aliases['broker']['sha256'], 'trustSHA256': 'a' * 64,
            'sourceBindingSHA256': 'b' * 64, 'database': 'helmut_unit_diagnostic_' + self.nonce}, 'footer': {'complete': True}}}
        h._root = lambda *args: types.SimpleNamespace(tick=lambda: True, close_metadata=lambda: close)
        h.trace_read = types.SimpleNamespace(tick=lambda: True, close_metadata=lambda: close, output=[M.encode(trace)])
        h._poll_probes = h._owner_messages = h._release_clients = h._quiesce_clients = lambda: None
        h._observe = lambda: self.observation(); h._accept(self.request('OWNER_STOP'), '1' * 64)
        h.tick()
        self.assertEqual(h.state, 'STOPPED')
        reply = json.loads((self.case / 'HOST_REPLY_01.PRIVATE.json').read_bytes())['result']
        self.assertEqual(reply['ownerProcessClose'], close)
        self.assertEqual(Path(reply['phaseCapture']['pin']['path']).read_bytes(), b'broker-marker\n')
        self.assertEqual(reply['phaseCapture']['containerId'], h.source_id)

    def test_readonly_http_qualifier_pass_persists_before_qualified_reply(self):
        h = self.host; self.config['nativeDiagnosticMode'] = 'readonly-http-pre-admission-v1'
        child, close = self.closed_phase_child(b'endpoint-marker\n')
        h.state = 'OWNER'; h.active_client = 'c' * 64
        h.clients[h.active_client] = {'mode': 'qualifier', 'child': child, 'exitReleased': True,
            'process': {'hostPID': 456, 'startTicks': '7', 'namespacePID': 8},
            'row': {'State': {'Running': False, 'ExitCode': 0, 'OOMKilled': False}}}
        report = {'selection': self.selection, 'signedReadonlyContractObserved': True, 'seedPerformed': False,
            'scopeClaimConsumed': False, 'actualNodeBudget': {'nodeVersion': 'v24.19.0', 'execArgv': M.FLAGS,
                'oldSpaceMiB': 384, 'semiSpaceMiB': 16, 'heapSizeLimitBytes': 400 * 1024**2}}
        M.write_once(self.case / 'client/ENDPOINT_QUALIFICATION.SAFE.json', M.encode(report))
        h.pending = {'request': self.request('CLIENT_QUALIFY'), 'sha256': '1' * 64, 'began': M.time.monotonic()}
        h._poll_probes = h._owner_messages = h._release_clients = h._quiesce_clients = lambda: None
        h._observe = lambda: self.observation()
        h.tick()
        self.assertEqual(h.state, 'QUALIFIED')
        reply = json.loads((self.case / 'HOST_REPLY_01.PRIVATE.json').read_bytes())['result']
        self.assertEqual(reply['phaseCapture']['processClose'], close)
        self.assertEqual(Path(reply['phaseCapture']['pin']['path']).read_bytes(), b'endpoint-marker\n')
        self.assertEqual(reply['phaseCapture']['containerId'], h.active_client)

    def test_tick_failure_permanently_seals_no_retry(self):
        self.host._observe = lambda: M.need(False, 'simulated-drift')
        with self.assertRaisesRegex(RuntimeError, '^native-execution-host-sealed-failure$'):
            self.host.tick()
        with self.assertRaisesRegex(RuntimeError, 'sealed-host'):
            self.host.tick()

    def test_failure_cause_is_private_once_and_never_public_exception(self):
        sentinel = os.urandom(32).hex()
        def failed(): raise ValueError(sentinel)
        self.host._observe = failed
        with self.assertRaisesRegex(RuntimeError, '^native-execution-host-sealed-failure$'):
            self.host.tick()
        path = self.case / 'EXECUTION_HOST_FAILURE.PRIVATE.json'
        raw, _ = M.read_file(path, uid=os.getuid()); value = M.unique(raw)
        self.assertTrue(value['exception']['type'] == 'ValueError' and value['exception']['message'] == sentinel)
        self.assertTrue(value['selection'] == self.selection and path.stat().st_nlink == 1 and path.stat().st_mode & 0o777 == 0o600)
        before = raw
        with self.assertRaises(RuntimeError): self.host.tick()
        self.assertTrue(path.read_bytes() == before)

    def test_transport_capture_is_private_bounded_and_close_never_exports_bytes(self):
        sentinel = os.urandom(32).hex().encode()
        snapshot = {'schema': 'helmut-local-unit-native-pipe-failure-private/1', 'registeredHostPID': 75,
                    'transportFailure': {'type': 'BrokenPipeError', 'errno': 32}, 'localExitCode': 255,
                    'stdoutNaturalEOF': True, 'stderrNaturalEOF': True, 'remoteExitConfirmed': False,
                    'stdoutBase64': '', 'stderrBase64': base64.b64encode(sentinel).decode()}
        class FailedPipe:
            transport_failure = {'type': 'BrokenPipeError', 'errno': 32}
            eof = [True, True]
            child = FakePopen(['fixed'], stdin=M.subprocess.PIPE)
            selector = FakeSelector()
            def tick(this): raise BrokenPipeError(32, 'pipe-closed')
            def failure_snapshot(this, drain=True): return copy.deepcopy(snapshot)
            def close_metadata(this): return {'exitCode': 255, 'stdoutNaturalEOF': True, 'stderrNaturalEOF': True, 'registeredHostPID': 75}
        child = FailedPipe(); child.child.returncode = 255
        self.host.children = [child]; self.host.owner = child
        with self.assertRaisesRegex(RuntimeError, '^native-execution-host-sealed-failure$') as context:
            self.host.tick()
        path = self.case / 'EXECUTION_HOST_CHILD_FAILURE_000.PRIVATE.json'
        raw, pin = M.read_file(path, 600 * 1024, uid=os.getuid()); value = M.unique(raw)
        self.assertTrue(base64.b64decode(value['stderrBase64']) == sentinel and value['localExitCode'] == 255)
        report = M.unique((self.case / 'EXECUTION_HOST_FAILURE.PRIVATE.json').read_bytes())
        self.assertTrue(report['privateChildCaptures'] == [{'childIndex': 0, 'pin': pin}])
        self.assertTrue(path.stat().st_nlink == 1 and path.stat().st_mode & 0o777 == 0o600)
        close = self.host.close(); public = M.encode(close)
        self.assertTrue(close['clean'] is False and close['children'][0]['exitCode'] == 255)
        self.assertTrue(sentinel not in public and value['stderrBase64'].encode() not in public and 'Base64' not in str(close))
        final = self.case / 'EXECUTION_HOST_CHILD_FAILURE_CLOSE_000.PRIVATE.json'
        self.assertTrue(M.unique(final.read_bytes()) == snapshot and not list(self.case.glob('*FAILURE*.SAFE.*')))
        self.assertTrue(sentinel.decode() not in str(context.exception))
        self.assertTrue(self.host.close() is close and path.read_bytes() == raw)

    def test_constructor_capture_and_publication_error_do_not_heal_failure(self):
        sentinel = os.urandom(24).hex()
        error = OSError(5, 'constructor-io')
        error.nativePipePrivateCapture = {'stderrBase64': base64.b64encode(sentinel.encode()).decode()}
        def failed(): raise error
        self.host._observe = failed
        with self.assertRaisesRegex(RuntimeError, '^native-execution-host-sealed-failure$'):
            self.host.tick()
        captured = M.unique((self.case / 'EXECUTION_HOST_CHILD_FAILURE_000.PRIVATE.json').read_bytes())
        self.assertTrue(base64.b64decode(captured['stderrBase64']).decode() == sentinel)
        # The existing private file cannot be replaced by another capture.
        result = self.host._private_pipe_captures(error)
        self.assertTrue(result[0]['captureError']['type'] == 'FileExistsError' and result[0]['captureError']['errno'] == 17
                        and self.host.failure is not None)
        huge = OSError(); huge.nativePipePrivateCapture = {'stderrBase64': 'a' * (600 * 1024)}
        self.assertTrue(self.host._private_pipe_captures(huge)[0]['captureError']['type'] == 'RuntimeError')

    def entry_capture_fixture(self, exit_code=None):
        child = types.SimpleNamespace(transport_failure=None, selector=FakeSelector(), eof=[False, False])
        child.child = FakePopen(['fixed-entry'], stdin=M.subprocess.PIPE)
        child.child.returncode = exit_code
        child.eof = [exit_code is not None, exit_code is not None]
        child.tick = lambda: child.child.poll() is not None and all(child.eof)
        child.close_metadata = lambda: {'exitCode': child.child.poll(), 'stdoutNaturalEOF': child.eof[0],
            'stderrNaturalEOF': child.eof[1], 'registeredHostPID': 75}
        child.failure_snapshot = lambda drain=True: {'schema': 'helmut-local-unit-native-pipe-failure-private/1',
            'registeredHostPID': 75, 'localExitCode': child.child.poll(), 'stdoutNaturalEOF': child.eof[0],
            'stderrNaturalEOF': child.eof[1], 'stdoutBase64': '', 'stderrBase64': '', 'remoteExitConfirmed': False}
        self.host.children = [child]; self.host.active_client = 'f' * 64
        self.host.clients = {self.host.active_client: {'mode': 'entry', 'child': child}}
        return child

    def test_active_entry_capture_precedes_cleanup_stop_and_remains_private(self):
        child = self.entry_capture_fixture(); events = []; sentinel = os.urandom(24)
        original_snapshot = child.failure_snapshot
        def snapshot(drain=True):
            events.append(('snapshot', drain))
            return {**original_snapshot(drain), 'stderrBase64': base64.b64encode(sentinel).decode()}
        child.failure_snapshot = snapshot
        self.host.state = 'ENTRY'
        self.host._observe = lambda: M.need(False, 'entry-observation-failure')
        with self.assertRaisesRegex(RuntimeError, '^native-execution-host-sealed-failure$'):
            self.host.tick()
        path = self.case / 'EXECUTION_HOST_CHILD_FAILURE_000.PRIVATE.json'
        before, pin = M.read_file(path, 600 * 1024, uid=os.getuid()); value = M.unique(before)
        self.assertIsNone(value['localExitCode']); self.assertFalse(value['stdoutNaturalEOF'])
        self.assertEqual(base64.b64decode(value['stderrBase64']), sentinel)
        self.assertEqual(path.stat().st_mode & 0o777, 0o600); self.assertEqual(path.stat().st_nlink, 1)
        report = M.unique((self.case / 'EXECUTION_HOST_FAILURE.PRIVATE.json').read_bytes())
        self.assertEqual(report['privateChildCaptures'], [{'childIndex': 0, 'pin': pin}])
        def docker(argv, **kwargs):
            if argv[0] == 'inspect':
                return types.SimpleNamespace(stdout=json.dumps([{'State': {'Running': True}}]))
            self.assertEqual(argv, ['stop', '--time', '2', self.host.active_client])
            self.assertTrue(path.is_file()); events.append(('stop', None))
            child.child.returncode = 137; child.eof = [True, True]
            return types.SimpleNamespace(stdout='')
        self.host._docker = docker
        close = self.host.close()
        self.assertEqual(events, [('snapshot', True), ('stop', None), ('snapshot', False)])
        self.assertFalse(close['clean']); self.assertEqual(close['children'][0]['exitCode'], 137)
        self.assertNotIn('Base64', str(close)); self.assertNotIn(sentinel, M.encode(close))
        self.assertEqual(path.read_bytes(), before)
        # Popen is forbidden in this fixture. The trace-reader constructor failure
        # is retained first; its capture ordinal is not the Entry child's index.
        unavailable = M.unique((self.case / 'EXECUTION_HOST_TRACE_READ_UNAVAILABLE.PRIVATE.json').read_bytes())
        self.assertEqual(unavailable['exceptionType'], 'AssertionError')
        self.assertTrue(self.host.failure_trace_attempted); self.assertIsNone(self.host.failure_trace_read)
        self.assertIsInstance(self.host.failure_trace_error, AssertionError)
        self.assertEqual(self.host.children, [child])  # Entry remains registered childIndex0; reader has none.
        self.assertEqual(self.host.clients[self.host.active_client]['mode'], 'entry')
        self.assertIs(self.host.clients[self.host.active_client]['child'], child)
        constructor = M.unique((self.case / 'EXECUTION_HOST_CHILD_FAILURE_CLOSE_000.PRIVATE.json').read_bytes())
        self.assertEqual(constructor, self.host.failure_trace_error.nativePipePrivateCapture)
        self.assertIsNone(constructor['registeredHostPID']); self.assertIsNone(constructor['localExitCode'])
        self.assertFalse(constructor['stdoutNaturalEOF'] or constructor['stderrNaturalEOF'])
        self.assertFalse(constructor['remoteExitConfirmed'])
        final = M.unique((self.case / 'EXECUTION_HOST_CHILD_FAILURE_CLOSE_001.PRIVATE.json').read_bytes())
        self.assertEqual(final['registeredHostPID'], value['registeredHostPID'])
        self.assertEqual(final['registeredHostPID'], close['children'][0]['registeredHostPID'])
        self.assertEqual(final['localExitCode'], 137); self.assertTrue(final['stdoutNaturalEOF'] and final['stderrNaturalEOF'])
        with self.assertRaisesRegex(RuntimeError, 'sealed-host'): self.host.tick()

    def test_active_entry_real_pipe_capture_keeps_existing_stream_caps(self):
        with patch.object(M.subprocess, 'Popen', FakePopen), patch.object(M.selectors, 'DefaultSelector', FakeSelector), \
             patch.object(M.os, 'set_blocking', lambda *args: None):
            child = M._PipeChild(['fixed-entry'])
        child.output = [bytearray(b'a' * (M.CAP - 4)), bytearray(b'b' * (128 * 1024 - 4))]
        reads = {10: [b'overflow', b''], 11: [b'overflow', b'']}
        self.host.children = [child]; self.host.active_client = 'f' * 64
        self.host.clients = {self.host.active_client: {'mode': 'entry', 'child': child}}
        with patch.object(M.os, 'read', lambda fd, size: reads[fd].pop(0)), \
             patch.object(M.os, 'set_blocking', lambda *args: None):
            captures = self.host._private_pipe_captures()
        path = self.case / 'EXECUTION_HOST_CHILD_FAILURE_000.PRIVATE.json'
        raw = path.read_bytes(); value = M.unique(raw)
        self.assertEqual(len(captures), 1); self.assertLessEqual(len(raw), 600 * 1024)
        self.assertEqual(value['stdoutBytes'], M.CAP); self.assertEqual(value['stderrBytes'], 128 * 1024)
        self.assertTrue(value['stdoutTruncated'] and value['stderrTruncated'])
        self.assertTrue(value['stdoutNaturalEOF'] and value['stderrNaturalEOF'])
        self.assertIsNone(value['localExitCode']); self.assertFalse(value['remoteExitConfirmed'])

    def test_missing_or_nonactive_or_qualifier_entry_is_not_extra_capture(self):
        child = self.entry_capture_fixture()
        variants = [{}, {self.host.active_client: {'mode': 'qualifier', 'child': child}},
                    {'9' * 64: {'mode': 'entry', 'child': child}}, {self.host.active_client: {'mode': 'entry'}}]
        for clients in variants:
            with self.subTest(kind=list(clients)):
                self.host.clients = clients
                self.assertEqual(self.host._private_pipe_captures(), [])
        self.assertFalse(list(self.case.glob('EXECUTION_HOST_CHILD_FAILURE*')))

    def test_closed_entry_capture_keeps_observed_exit_and_eof_without_redrain(self):
        child = self.entry_capture_fixture(exit_code=1); calls = []
        original_snapshot = child.failure_snapshot
        child.failure_snapshot = lambda drain=True: calls.append(drain) or original_snapshot(drain)
        child.selector.close(); child.child.stdin.close(); child.child.stdout.close(); child.child.stderr.close()
        captures = self.host._private_pipe_captures(after_close=True)
        value = M.unique((self.case / 'EXECUTION_HOST_CHILD_FAILURE_CLOSE_000.PRIVATE.json').read_bytes())
        self.assertEqual(calls, [False]); self.assertEqual(len(captures), 1)
        self.assertEqual(value['localExitCode'], 1); self.assertTrue(value['stdoutNaturalEOF'] and value['stderrNaturalEOF'])
        self.assertFalse(value['remoteExitConfirmed'])

    def test_entry_oversized_or_existing_capture_never_heals_failure(self):
        child = self.entry_capture_fixture(); original_snapshot = child.failure_snapshot
        child.failure_snapshot = lambda drain=True: {'stderrBase64': 'a' * (600 * 1024)}
        self.host._observe = lambda: M.need(False, 'entry-observation-failure')
        with self.assertRaisesRegex(RuntimeError, '^native-execution-host-sealed-failure$'):
            self.host.tick()
        report = M.unique((self.case / 'EXECUTION_HOST_FAILURE.PRIVATE.json').read_bytes())
        self.assertEqual(report['privateChildCaptures'][0]['captureError']['type'], 'RuntimeError')
        self.assertIsNotNone(self.host.failure)
        child.failure_snapshot = original_snapshot
        first = self.host._private_pipe_captures()
        path = self.case / 'EXECUTION_HOST_CHILD_FAILURE_000.PRIVATE.json'; before = path.read_bytes()
        again = self.host._private_pipe_captures()
        self.assertIn('pin', first[0]); self.assertEqual(again[0]['captureError']['type'], 'FileExistsError')
        self.assertEqual(path.read_bytes(), before); self.assertIsNotNone(self.host.failure)

    def diagnostic_trace_fixture(self, raw, mutation=None, request=b'{}'):
        names = ('st_dev', 'st_ino', 'st_mode', 'st_uid', 'st_gid', 'st_nlink', 'st_size', 'st_mtime_ns', 'st_ctime_ns')
        original = dict(zip(names, (2, 90, 0o100600, 0, 0, 1, len(raw), 123, 456)))
        data, output, calls = io.BytesIO(raw), io.BytesIO(), []
        def metadata(named=False):
            row = dict(original)
            changes = {'uid': ('st_uid', 1000), 'mode': ('st_mode', 0o100644), 'nlink': ('st_nlink', 2),
                       'directory': ('st_mode', 0o040600)}
            if mutation in changes:
                key, value = changes[mutation]; row[key] = value
            if data.tell() and mutation == ('named-drift' if named else 'fd-drift'):
                row['st_ctime_ns'] += 1
            return types.SimpleNamespace(**row)
        def opened(path, flags):
            calls.append((path, flags))
            self.assertEqual(path, M.TRACE)
            self.assertEqual(flags, M.os.O_RDONLY | M.os.O_NOFOLLOW | M.os.O_NONBLOCK)
            if mutation in ('symlink', 'missing'):
                raise OSError(40 if mutation == 'symlink' else 2, 'fixture-only')
            return 17
        fake_os = types.SimpleNamespace(open=opened, close=lambda fd: calls.append(('close', fd)),
            read=lambda fd, size: data.read(size), fstat=lambda fd: metadata(), lstat=lambda path: metadata(True),
            O_RDONLY=M.os.O_RDONLY, O_NOFOLLOW=M.os.O_NOFOLLOW, O_NONBLOCK=M.os.O_NONBLOCK,
            getuid=lambda: 0, geteuid=lambda: 0, getgid=lambda: 0, getegid=lambda: 0,
            path=types.SimpleNamespace(realpath=lambda path: '/not-canonical' if mutation == 'canonical' else path))
        fake_sys = types.SimpleNamespace(stdin=types.SimpleNamespace(buffer=io.BytesIO(request)),
                                        stdout=types.SimpleNamespace(buffer=output))
        def imports(name, *args, **kwargs):
            if name == 'os': return fake_os
            if name == 'sys': return fake_sys
            self.assertIn(name, ('json', 'stat', 'hashlib', 'base64'))
            return builtins.__import__(name, *args, **kwargs)
        scope = {'__name__': 'trace_fixture_only', '__builtins__': {**vars(builtins), '__import__': imports}}
        return lambda: exec(compile(M.ROOT_DIAGNOSTIC_TRACE_READ, '<fixed-trace-fixture>', 'exec'), scope), output, calls

    def test_diagnostic_trace_preserves_header_partial_and_cap_bytes_without_parsing(self):
        for raw in (b'{"header":true}\n', b'{"header":true}\n{"unfinished', b'', b'x' * 65536):
            with self.subTest(bytes=len(raw)):
                run, output, calls = self.diagnostic_trace_fixture(raw); run()
                value = M.unique(output.getvalue())
                self.assertEqual(set(value), {'schema', 'pin', 'identity', 'contentsBase64'})
                self.assertEqual(value['pin'], {'path': M.TRACE, 'bytes': len(raw), 'sha256': M.sha(raw)})
                self.assertEqual(base64.b64decode(value['contentsBase64']), raw)
                self.assertEqual(len(value['identity']), 9)
                self.assertNotIn('complete', value); self.assertNotIn('footer', value)
                self.assertEqual(calls[-1], ('close', 17)); self.assertLess(len(output.getvalue()), M.CAP)

    def test_diagnostic_trace_rejects_cap_symlink_identity_and_free_path_without_retry(self):
        for mutation in ('uid', 'mode', 'nlink', 'directory', 'named-drift', 'fd-drift', 'canonical', 'symlink', 'missing'):
            with self.subTest(mutation=mutation):
                run, output, calls = self.diagnostic_trace_fixture(b'partial', mutation)
                with self.assertRaises((AssertionError, OSError)): run()
                self.assertEqual(output.getvalue(), b'')
                self.assertLessEqual(sum(path == M.TRACE for path, _ in calls), 1)
        run, output, _ = self.diagnostic_trace_fixture(b'x' * 65537)
        with self.assertRaises(AssertionError): run()
        self.assertEqual(output.getvalue(), b'')
        run, output, calls = self.diagnostic_trace_fixture(b'partial', request=b'{"path":"/other"}')
        with self.assertRaises(AssertionError): run()
        self.assertEqual(calls, []); self.assertEqual(output.getvalue(), b'')

    def trace_close_fixture(self, exit_code=0, no_eof=False):
        entry = self.entry_capture_fixture(exit_code=137); self.host.state = 'ENTRY'
        self.host.failure = 'sealed-native-host-failure'; events = []
        raw = b'{"privateRootDiagnostic":true}\n'
        with patch.object(M.subprocess, 'Popen', FakePopen), patch.object(M.selectors, 'DefaultSelector', FakeSelector), \
             patch.object(M.os, 'set_blocking', lambda *args: None):
            reader = M._PipeChild(['fixed-diagnostic-read'], M.encode({}), lifetime=8)
        reader.child.returncode = exit_code
        chunks = {10: [raw, b''], 11: [b'']}
        def read(fd, size):
            if no_eof: raise BlockingIOError()
            return chunks[fd].pop(0)
        actual_write = M.os.write
        def write(fd, raw):
            return len(raw) if fd == 12 else actual_write(fd, raw)
        def root(code, value):
            self.assertEqual(code, M.ROOT_DIAGNOSTIC_TRACE_READ); self.assertEqual(value, {})
            events.append('trace-start'); self.host.children.append(reader); return reader
        def docker(argv, **kwargs):
            if argv[0] == 'inspect': return types.SimpleNamespace(stdout=json.dumps([{'State': {'Running': True}}]))
            self.assertEqual(argv, ['stop', '--time', '2', self.host.active_client])
            events.append('client-stop'); return types.SimpleNamespace(stdout='')
        self.host._root = root; self.host._docker = docker
        return reader, read, write, events

    def test_diagnostic_trace_starts_before_cleanup_and_captures_real_pipe_exit_eofs_once(self):
        reader, read, write, events = self.trace_close_fixture()
        self.host.failure = None  # External Controller abort, not a Host tick error.
        with patch.object(M.os, 'read', read), patch.object(M.os, 'write', write):
            close = self.host.close()
        self.assertEqual(events, ['trace-start', 'client-stop'])
        self.assertIs(self.host.failure_trace_read, reader); self.assertTrue(self.host.failure_trace_attempted)
        self.assertEqual(close['children'][-1], {'exitCode': 0, 'stdoutNaturalEOF': True, 'stderrNaturalEOF': True, 'registeredHostPID': 75})
        value = M.unique((self.case / 'EXECUTION_HOST_CHILD_FAILURE_CLOSE_001.PRIVATE.json').read_bytes())
        self.assertEqual(value['localExitCode'], 0); self.assertTrue(value['stdoutNaturalEOF'] and value['stderrNaturalEOF'])
        self.assertEqual(base64.b64decode(value['stdoutBase64']), b'{"privateRootDiagnostic":true}\n')
        self.assertFalse(value['remoteExitConfirmed']); self.assertEqual(value['inputWrittenBytes'], value['inputTotalBytes'])
        self.assertFalse(close['clean']); self.assertNotIn('Base64', str(close)); self.assertNotIn('privateRootDiagnostic', str(close))
        self.assertIs(self.host.close(), close); self.assertEqual(events, ['trace-start', 'client-stop'])

    def test_diagnostic_trace_input_exit_and_eofs_are_pumped_before_destructive_stop(self):
        reader, read, write, events = self.trace_close_fixture()
        self.host.failure = None  # The Controller can abort before a Host failure.
        original_docker = self.host._docker; stop_observations = []
        def docker(argv, **kwargs):
            if argv[0] == 'stop':
                stop_observations.append((reader.offset, reader.child.poll(), list(reader.eof), reader.finished))
            return original_docker(argv, **kwargs)
        self.host._docker = docker
        with patch.object(M.os, 'read', read), patch.object(M.os, 'write', write):
            close = self.host.close()
        self.assertEqual(stop_observations, [(2, 0, [True, True], True)])
        self.assertEqual(events, ['trace-start', 'client-stop']); self.assertFalse(close['clean'])
        self.assertEqual(close['children'][-1]['exitCode'], 0)
        value = M.unique((self.case / 'EXECUTION_HOST_CHILD_FAILURE_CLOSE_001.PRIVATE.json').read_bytes())
        self.assertEqual(value['inputWrittenBytes'], 2)
        self.assertTrue(value['stdoutNaturalEOF'] and value['stderrNaturalEOF'])
        self.assertEqual(base64.b64decode(value['stdoutBase64']), b'{"privateRootDiagnostic":true}\n')
        self.assertFalse(value['remoteExitConfirmed'])
        self.assertIs(self.host.close(), close); self.assertEqual(events, ['trace-start', 'client-stop'])

    def test_diagnostic_trace_missing_eof_shares_close_budget_and_stays_unknown(self):
        reader, read, write, events = self.trace_close_fixture(no_eof=True)
        original_docker = self.host._docker; clock = [0.0]; stop_times = []
        def monotonic():
            clock[0] += .25; return clock[0]
        def docker(argv, **kwargs):
            if argv[0] == 'stop': stop_times.append(clock[0])
            return original_docker(argv, **kwargs)
        self.host._docker = docker
        with patch.object(M.os, 'read', read), patch.object(M.os, 'write', write), \
             patch.object(M.time, 'monotonic', monotonic), patch.object(M.time, 'sleep', lambda _: None):
            close = self.host.close()
        self.assertEqual(len(stop_times), 1); self.assertGreaterEqual(stop_times[0], 6)
        self.assertLessEqual(clock[0] - stop_times[0], .5)  # No second six-second pump budget.
        self.assertEqual(events, ['trace-start', 'client-stop']); self.assertFalse(close['clean'])
        self.assertEqual(len(close['children']), 1)  # Reader exit0 alone cannot enter confirmed metadata.
        value = M.unique((self.case / 'EXECUTION_HOST_CHILD_FAILURE_CLOSE_001.PRIVATE.json').read_bytes())
        self.assertEqual(value['localExitCode'], 0); self.assertEqual(value['inputWrittenBytes'], 2)
        self.assertFalse(value['stdoutNaturalEOF'] or value['stderrNaturalEOF'] or value['remoteExitConfirmed'])

    def test_diagnostic_trace_nonzero_or_missing_eof_remains_failed_and_private(self):
        reader, read, write, events = self.trace_close_fixture(exit_code=1)
        with patch.object(M.os, 'read', read), patch.object(M.os, 'write', write):
            close = self.host.close()
        self.assertFalse(close['clean']); self.assertEqual(close['children'][-1]['exitCode'], 1)
        value = M.unique((self.case / 'EXECUTION_HOST_CHILD_FAILURE_CLOSE_001.PRIVATE.json').read_bytes())
        self.assertEqual(value['localExitCode'], 1); self.assertTrue(value['stdoutNaturalEOF'] and value['stderrNaturalEOF'])
        # New independent fixture: a returned local exit cannot manufacture EOF.
        for path in self.case.glob('EXECUTION_HOST_CHILD_FAILURE_CLOSE_*.PRIVATE.json'): path.unlink()
        self.host.closed = False; self.host.failure_trace_attempted = False; self.host.failure_trace_read = None
        reader, read, write, events = self.trace_close_fixture(no_eof=True)
        clock = iter(range(1000))
        with patch.object(M.os, 'read', read), patch.object(M.os, 'write', write), \
             patch.object(M.time, 'monotonic', lambda: next(clock)), patch.object(M.time, 'sleep', lambda _: None):
            close = self.host.close()
        self.assertFalse(close['clean']); self.assertEqual(len(close['children']), 1)
        value = M.unique((self.case / 'EXECUTION_HOST_CHILD_FAILURE_CLOSE_001.PRIVATE.json').read_bytes())
        self.assertEqual(value['localExitCode'], 0); self.assertFalse(value['stdoutNaturalEOF'] or value['stderrNaturalEOF'])
        self.assertFalse(value['remoteExitConfirmed']); self.assertEqual(events, ['trace-start', 'client-stop'])

    def test_diagnostic_trace_start_failure_is_private_once_and_never_prevents_cleanup(self):
        entry = self.entry_capture_fixture(exit_code=137); self.host.state = 'ENTRY'; events = []
        error = OSError(2, 'private-fixture-message')
        error.nativePipePrivateCapture = {'localExitCode': None, 'stdoutNaturalEOF': False, 'stderrNaturalEOF': False}
        def root(*args): events.append('trace-start'); raise error
        self.host._root = root
        self.host._docker = lambda *args, **kwargs: types.SimpleNamespace(stdout=json.dumps([{'State': {'Running': False}}]))
        close = self.host.close()
        self.assertFalse(close['clean']); self.assertEqual(events, ['trace-start'])
        private = self.case / 'EXECUTION_HOST_TRACE_READ_UNAVAILABLE.PRIVATE.json'
        value = M.unique(private.read_bytes()); self.assertEqual(value['errno'], 2)
        self.assertEqual(set(value), {'schema', 'exceptionType', 'errno'})
        self.assertNotIn('private-fixture-message', private.read_text()); self.assertEqual(private.stat().st_mode & 0o777, 0o600)
        attached = M.unique((self.case / 'EXECUTION_HOST_CHILD_FAILURE_CLOSE_000.PRIVATE.json').read_bytes())
        self.assertIsNone(attached['localExitCode']); self.assertFalse(attached['stdoutNaturalEOF'] or attached['stderrNaturalEOF'])
        self.assertIs(self.host.close(), close); self.assertEqual(events, ['trace-start'])

    def test_diagnostic_trace_is_not_started_for_other_clients_clean_close_or_unknown_source(self):
        self.host._root = lambda *args: self.fail('unexpected root diagnostic read')
        self.host._docker = lambda *args, **kwargs: types.SimpleNamespace(stdout=json.dumps([{'State': {'Running': False}}]))
        for mode, state, source in (('qualifier', 'ENTRY', 'd' * 64), ('entry', 'STOPPED', 'd' * 64),
                                    ('entry', 'ENTRY', '9' * 64), ('entry', 'ENTRY', None), ('entry', 'ENTRY', 'malformed')):
            with self.subTest(mode=mode, state=state):
                self.host.closed = False; self.host.failure = None; self.host.state = state; self.host.source_id = source
                self.entry_capture_fixture(exit_code=0); self.host.clients[self.host.active_client]['mode'] = mode
                self.host.close(); self.assertFalse(self.host.failure_trace_attempted)
        self.host.closed = False; self.host.state = 'ENTRY'; self.host.source_id = 'd' * 64; self.host.clients = {}
        self.host.close(); self.assertFalse(self.host.failure_trace_attempted)

    def test_source_exit_after_confirmed_owner_stop_is_not_live_failure(self):
        self.host.state = 'STOPPED'; self.host.last_observation = {'observedAtUTC': '2026-10-22T00:00:00.000Z'}
        self.host._observe = lambda: M.need(False, 'source-already-exited')
        result = self.host.tick()
        self.assertTrue(result['state'] == 'STOPPED' and result['observation'] is self.host.last_observation and self.host.failure is None)
        self.host.state = 'DONE'
        with self.assertRaisesRegex(RuntimeError, 'sealed-failure'):
            self.host.tick()

    def test_stopped_host_still_requires_actual_local_child_close(self):
        self.host.state = 'STOPPED'; self.host.last_observation = {'observedAtUTC': '2026-10-22T00:00:00.000Z'}
        self.host.children = [FakeChild()]
        with self.assertRaisesRegex(RuntimeError, 'sealed-failure'):
            self.host.tick()

    def test_root_private_input_is_stdin_never_argv(self):
        self.assertTrue(Path(M.DOCKER[0]).is_absolute())
        with patch.object(M, '_PipeChild', FakeChild):
            child = self.host._root(M.BOOTSTRAP, {'private': 'not-for-argv'})
        self.assertTrue(child.data == M.encode({'private': 'not-for-argv'}))
        self.assertTrue(not any('not-for-argv' in x for x in child.argv))
        self.assertTrue(child.argv[:8] == [*M.DOCKER, '--config', self.host.directory, 'exec', '-i', '--user', '0:0'])
        self.assertTrue(child.argv[-1] == M.BOOTSTRAP)

    def test_root_programs_are_syntax_checked_without_running(self):
        for code in (M.BOOTSTRAP, M.ROOT_READ, M.ROOT_SIGNAL, M.INSTALLER):
            compile(code, '<fixed-root-program>', 'exec')
        self.assertTrue('os.execve' in M.BOOTSTRAP and 'O_EXCL' in M.BOOTSTRAP and 'os.getuid()==0' in M.BOOTSTRAP)
        self.assertTrue('SIGTERM' in M.ROOT_SIGNAL and 'startTicks' in M.ROOT_SIGNAL and 'NoNewPrivs' in M.ROOT_SIGNAL)

    def test_actual_source_id_and_single_node_mount_required(self):
        bad = copy.deepcopy(self.config); bad['actualSourceContainerId'] = '9' * 64
        with self.assertRaises(RuntimeError):
            M.NativeExecutionHost(self.native, self.supervisor, bad, self.case, {}, 'd' * 64, self.mounts, self.plan)
        with self.assertRaises(RuntimeError):
            M.NativeExecutionHost(self.native, self.supervisor, self.config, self.case, {}, 'd' * 64,
                                  [*self.mounts, ('/opt/original', '/opt/original', True)], self.plan)
        with patch.object(M, 'host_user', self.real_host_user), patch.object(M.os, 'getuid', lambda: 0):
            with self.assertRaisesRegex(RuntimeError, 'actual-host-uid-gid-1000'):
                M.NativeExecutionHost(self.native, self.supervisor, self.config, self.case, {}, 'd' * 64, self.mounts, self.plan)

    def test_production_actor_boundary_with_synthetic_status_not_ci_uid(self):
        status = {'raw': 'Uid:\t1000\t1000\t1000\t1000\nGid:\t1000\t1000\t1000\t1000\n'}
        with (patch.object(M.os, 'getuid', lambda: 1000), patch.object(M.os, 'geteuid', lambda: 1000),
              patch.object(M.os, 'getgid', lambda: 1000), patch.object(M.os, 'getegid', lambda: 1000),
              patch.object(M.Path, 'read_text', lambda *a, **k: status['raw'])):
            self.real_host_user()
            for raw in ('Uid:\t1001\t1001\t1001\t1001\nGid:\t1001\t1001\t1001\t1001\n',
                        'Uid:\t1000\t1000\t1000\t1001\nGid:\t1000\t1000\t1000\t1000\n'):
                status['raw'] = raw
                with self.assertRaisesRegex(RuntimeError, 'actual-host-uid-gid-1000'):
                    self.real_host_user()

    def test_preparation_allocates_only_two_exact_tmpfs_volumes_and_public_aliases(self):
        inputs = self.base / 'public'; inputs.mkdir()
        self.config['repository'] = str(inputs); self.public_sources()
        pins = []
        for name in ('local-unit-native-owner.js', 'local-unit-diagnostic-broker.js', 'postgrest', 'node'):
            p = inputs / name; p.write_bytes(('bounded-public-' + name).encode()); p.chmod(0o600)
            pins.append(self.pin(str(p), p.read_bytes()))
        self.config.update(sourceCodePins=pins[:2], nodePin=pins[3])
        self.config['executionHost']['postgrestPin'] = pins[2]
        nss = [{'imagePath': target, 'source': pins[0], 'readonly': True}
               for target in ('/etc/group', '/etc/nsswitch.conf', '/etc/passwd')]
        runtime = [{'imagePath': target, 'source': pin, 'readonly': True, 'reuseExisting': True} for target, pin in (
            ('/lib64/ld-linux-x86-64.so.2', pins[3]), ('/usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2', pins[3]),
            ('/usr/lib/x86_64-linux-gnu/libc.so.6', pins[2]))]
        self.config['runtimeBindings'] = nss + runtime
        self.config['executionHost']['clientRuntimePins'] = nss + runtime
        self.config['executionHost']['ownerRuntimeBindings'] = runtime
        group = self.base / 'group'; group.mkdir(); g = group.stat()
        self.config.update(parentDevice=g.st_dev, parentInode=g.st_ino)
        volumes = {}; commands = []
        def docker(argv, **opts):
            self.assertEqual(argv[:2], ['--config', str(self.case / 'docker-empty-config')]); argv = argv[2:]
            commands.append(argv)
            if argv[:2] == ['volume', 'create']:
                recorded = M.unique((self.case / 'VOLUME_PREPARATION.SAFE.json').read_bytes())
                self.assertTrue(set(recorded) == {'schema', 'nonce', 'volumes'} and len(recorded['volumes']) == 2
                                and recorded['schema'] == 'helmut-local-unit-native-owned-volumes/1' and recorded['nonce'] == self.nonce)
                self.assertTrue(len([x for x in commands if x[:2] == ['volume', 'inspect']]) >= 2)
                options = [argv[i + 1] for i, x in enumerate(argv) if x == '--opt']
                volumes[argv[-1]] = {'Name': argv[-1], 'Driver': 'local', 'Options': dict(x.split('=', 1) for x in options)}
                return types.SimpleNamespace(stdout=argv[-1], returncode=0)
            name = argv[-1]
            return types.SimpleNamespace(returncode=0 if name in volumes else 1, stdout=json.dumps([volumes[name]]) if name in volumes else '',
                stderr='' if name in volumes else 'Error response from daemon: get ' + name + ': no such volume\n')
        installed = []
        def install(native, supervisor, config, alias_dir, public, actual_group, directory):
            installed.append((public, actual_group))
            for key, p, _, mode in public:
                M.write_once(alias_dir / key, Path(p['path']).read_bytes(), mode)
            for row in M.owner_runtime_copies(config, alias_dir):
                M.write_once(row['copy']['path'], Path(row['originalSource']['path']).read_bytes(), row['mode'])
            return {'containerId': '9' * 64, 'exitCode': 0, 'stdoutNaturalEOF': True, 'stderrNaturalEOF': True}
        native = types.SimpleNamespace(docker=docker, parent_path=lambda _: group)
        self.remove_config()
        actual_metadata_pin = M.metadata_pin
        def synthetic_actor_metadata(pin, uid=None, mode=None):
            if uid is not None: self.assertTrue(uid == 1000)
            return actual_metadata_pin(pin, uid=os.getuid() if uid is not None else None, mode=mode)
        shutdown = []
        for i in range(8):
            source = inputs / ('close-input-%02d' % i); source.write_bytes(('synthetic-close-source-%02d' % i).encode()); source.chmod(0o600)
            shutdown.append(('close-source-%02d' % i, self.pin(str(source), source.read_bytes()), '/opt/postgrest-close-source-%02d' % i, 0o444))
        with (patch.object(M, 'shutdown_public_sources', lambda: shutdown), patch.object(M, '_install_aliases', install), patch.object(M, 'metadata_pin', synthetic_actor_metadata)):
            plan = M.prepare_execution(native, self.supervisor, self.config, self.case)
        self.assertTrue(len(volumes) == 2 and len(plan['sourceAliasMounts']) == 11 and plan['nodeMount'] == (pins[3]['path'], pins[3]['path'], True))
        self.assertTrue(any('size=268435456,uid=1000,gid=1000,mode=0711' in v['Options']['o'] for v in volumes.values()))
        self.assertTrue(any('size=16777216,uid=0,gid=0,mode=0755' in v['Options']['o'] for v in volumes.values()))
        self.assertTrue(all((inputs / n).stat().st_mode & 0o777 == 0o600 for n in ('local-unit-native-owner.js', 'local-unit-diagnostic-broker.js', 'postgrest', 'node')))
        self.assertTrue((self.case / 'owner-public/owner').stat().st_mode & 0o777 == 0o444
                        and (self.case / 'owner-public/postgrest').stat().st_mode & 0o777 == 0o555)
        self.assertTrue(all(c[:2] in (['volume', 'inspect'], ['volume', 'create']) for c in commands))
        self.assertTrue(len(installed) == 1 and installed[0][1] == group and plan['knownSetupContainerIds'] == ['9' * 64])
        self.assertTrue(len(plan['clientPublicSourceMounts']) == 6 and plan['pythonMount'] == (self.config['pythonExecutable'], self.config['pythonExecutable'], True))
        self.assertEqual({target for _, target, _ in plan['clientRuntimeMounts']}, {r['imagePath'] for r in nss + runtime})
        self.assertTrue(plan['clientRuntimeMounts'] == [(r['source']['path'], r['imagePath'], True) for r in nss + runtime])
        self.assertTrue(len(plan['ownerRuntimeCopies']) == 3 and [r['mode'] for r in plan['ownerRuntimeCopies']] == [0o555, 0o555, 0o444])
        for row, original in zip(plan['ownerRuntimeCopies'], runtime):
            self.assertTrue(row['originalSource'] == original['source'] and row['imagePath'] == original['imagePath']
                            and row['installerContainerId'] == '9' * 64)
            self.assertTrue((row['copy']['path'], row['imagePath'], True) in plan['sourceOwnerRuntimeMounts'])

    def test_runtime_nss_exception_does_not_allow_other_etc_inputs(self):
        group = self.base / 'group'; group.mkdir(); g = group.stat()
        self.config.update(parentDevice=g.st_dev, parentInode=g.st_ino)
        self.config['sourceCodePins'] = [self.pin('/repo/local-unit-native-owner.js'), self.pin('/repo/local-unit-diagnostic-broker.js')]
        native = types.SimpleNamespace(parent_path=lambda _: group, docker=lambda *a, **k: self.fail('no Docker on rejected input'))
        for target in ('/etc/shadow', '/etc/passwd.extra', '/etc/../etc/passwd'):
            self.remove_config()
            row = {'imagePath': target, 'source': self.pin('/public/runtime'), 'readonly': True}
            self.config['runtimeBindings'] = [row]; self.config['executionHost']['clientRuntimePins'] = [row]
            with self.subTest(target=target), self.assertRaisesRegex(RuntimeError, 'public-runtime-target'):
                M.prepare_execution(native, self.supervisor, self.config, self.case)
            (self.case / 'owner-public').rmdir()

    def runtime_subset(self):
        loader = self.pin('/original/runtime/loader', b'synthetic-loader')
        libc = self.pin('/original/runtime/libc', b'synthetic-libc')
        rows = [{'source': p, 'imagePath': target, 'readonly': True, 'reuseExisting': True} for p, target in (
            (loader, '/lib64/ld-linux-x86-64.so.2'), (loader, '/usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2'),
            (libc, '/usr/lib/x86_64-linux-gnu/libc.so.6'))]
        self.config['runtimeBindings'] = copy.deepcopy(rows)
        self.config['executionHost']['ownerRuntimeBindings'] = copy.deepcopy(rows)
        return rows

    def test_owner_runtime_subset_keeps_pins_targets_and_loader_modes(self):
        rows = self.runtime_subset(); original = copy.deepcopy(self.config)
        copies = M.owner_runtime_copies(self.config, self.case / 'owner-public')
        self.assertTrue(len(copies) == 3 and [r['mode'] for r in copies] == [0o555, 0o555, 0o444])
        for index, row in enumerate(copies):
            self.assertTrue(row['originalSource'] == rows[index]['source'] and row['imagePath'] == rows[index]['imagePath'])
            self.assertTrue(row['copy'] == {**rows[index]['source'], 'path': str(self.case / 'owner-public' / ('runtime-%03d' % index))})
        self.assertTrue(self.config == original)

    def test_owner_runtime_rejects_pin_change_extra_private_target_and_duplicates(self):
        rows = self.runtime_subset()
        for change in ('pin', 'extra', 'private', 'duplicate', 'no-loader', 'writable', 'traversal'):
            self.config['runtimeBindings'] = copy.deepcopy(rows)
            selected = copy.deepcopy(rows); self.config['executionHost']['ownerRuntimeBindings'] = selected
            if change == 'pin': selected[2]['source']['sha256'] = '0' * 64
            elif change == 'extra': selected[2]['unexpected'] = True; self.config['runtimeBindings'] = copy.deepcopy(selected)
            elif change == 'private': selected[2]['source']['path'] = '/original/PGDATA/data'; self.config['runtimeBindings'] = copy.deepcopy(selected)
            elif change == 'duplicate': selected.append(copy.deepcopy(selected[0]))
            elif change == 'no-loader': selected.pop(0)
            elif change == 'writable': selected[2]['readonly'] = False; self.config['runtimeBindings'] = copy.deepcopy(selected)
            elif change == 'traversal': selected[2]['imagePath'] = '/usr/lib/../secret'; self.config['runtimeBindings'] = copy.deepcopy(selected)
            with self.subTest(change=change), self.assertRaises(RuntimeError):
                M.owner_runtime_copies(self.config, self.case / 'owner-public')

    def test_owner_runtime_installation_and_source_mounts_are_required_by_host(self):
        self.runtime_subset()
        copies = M.owner_runtime_copies(self.config, self.case / 'owner-public')
        self.plan['ownerRuntimeCopies'] = [{**r, 'installerContainerId': '9' * 64} for r in copies]
        self.plan['sourceOwnerRuntimeMounts'] = [(r['copy']['path'], r['imagePath'], True) for r in copies]
        self.plan['knownSetupContainerIds'] = ['9' * 64]
        self.plan['installerProcessClose'] = {'containerId': '9' * 64}
        observed = []
        with patch.object(M, 'metadata_pin', lambda pin, **options: observed.append((pin, options))):
            with self.assertRaisesRegex(RuntimeError, 'source-public-mount-closure'):
                M.NativeExecutionHost(self.native, self.supervisor, self.config, self.case, {}, 'd' * 64, self.mounts, self.plan)
            mounts = self.mounts + self.plan['sourceOwnerRuntimeMounts']
            host = M.NativeExecutionHost(self.native, self.supervisor, self.config, self.case, {}, 'd' * 64, mounts, self.plan)
            self.assertTrue(host.source_mounts == mounts and all(o == {'uid': 1000, 'mode': r['mode']}
                for (_, o), r in zip(observed[-3:], copies)))
            self.plan['ownerRuntimeCopies'][0]['copy']['sha256'] = '0' * 64
            with self.assertRaisesRegex(RuntimeError, 'source-owner-runtime-provenance'):
                M.NativeExecutionHost(self.native, self.supervisor, self.config, self.case, {}, 'd' * 64, mounts, self.plan)

    def test_only_six_public_external_sources_and_exact_python_pin_allowed(self):
        self.public_sources()
        mounts, python = M.public_source_mounts(self.supervisor, self.config)
        self.assertTrue(len(mounts) == 6 and all(a == b and ro for a, b, ro in mounts) and python[0] == self.config['pythonExecutable'])
        original = copy.deepcopy(self.config)
        self.config['sources'].append(self.pin(str(self.base / 'unexpected.PRIVATE.json')))
        with self.assertRaisesRegex(RuntimeError, 'external-public-code-closure'):
            M.public_source_mounts(self.supervisor, self.config)
        self.config = copy.deepcopy(original); self.config['reader'] = {**self.config['reader'], 'sha256': '0' * 64}
        with self.assertRaisesRegex(RuntimeError, 'explicit-public-source-pin'):
            M.public_source_mounts(self.supervisor, self.config)
        self.config = copy.deepcopy(original)
        self.config['sources'] = [p for p in self.config['sources'] if p['path'] != self.config['pythonExecutable']]
        with self.assertRaisesRegex(RuntimeError, 'python-original-source-pin'):
            M.public_source_mounts(self.supervisor, self.config)
        self.config = copy.deepcopy(original); self.config['sources'] = self.config['sources'][:-2] + self.config['sources'][-1:]
        with self.assertRaisesRegex(RuntimeError, 'explicit-jit-plan-pin'):
            M.public_source_mounts(self.supervisor, self.config)

    def test_unknown_existing_or_unreadable_volume_is_never_recorded_owned(self):
        group = self.base / 'group'; group.mkdir(); g = group.stat()
        self.config.update(parentDevice=g.st_dev, parentInode=g.st_ino)
        self.config['sourceCodePins'] = [self.pin('/repo/local-unit-native-owner.js'), self.pin('/repo/local-unit-diagnostic-broker.js')]
        calls = []
        def docker(argv, **kwargs):
            calls.append(argv)
            return types.SimpleNamespace(returncode=1, stdout='', stderr='permission denied')
        native = types.SimpleNamespace(parent_path=lambda _: group, docker=docker)
        self.remove_config()
        with (patch.object(M, 'public_source_mounts', lambda *a: ([], ('/python', '/python', True))),
              patch.object(M, '_install_aliases', lambda *a: {'containerId': '9' * 64})):
            with self.assertRaisesRegex(RuntimeError, 'volume-absence-not-established'):
                M.prepare_execution(native, self.supervisor, self.config, self.case)
        self.assertTrue(not (self.case / 'VOLUME_PREPARATION.SAFE.json').exists() and all(a[:2] != ['volume', 'create'] for a in calls))

    def test_owner_ready_then_genuine_fresh_root_heartbeat_required(self):
        budget = {'nodeVersion': 'v24.19.0', 'execArgv': M.FLAGS, 'oldSpaceMiB': 384, 'semiSpaceMiB': 16, 'heapSizeLimitBytes': 432 * 1024**2}
        binding = {'metadata': 'public'}
        self.host.handoff = {'start': {'originalService': {'publicSourceBinding': binding}}}
        self.host.source_identity = {'namespaces': {'pid': 'pid:[10]'}}
        ready = {'schema': 'helmut-local-unit-native-owner-ready/2', 'originalService': binding, 'ownerPID': 12, 'ownerStartTicks': '2',
                 'upstreamPID': 13, 'upstreamStartTicks': '3', 'ownerCodePin': self.aliases['owner'], 'brokerCodePin': self.aliases['broker'],
                 'upstreamExePin': self.aliases['postgrest'], 'nodeExePin': self.config['nodePin'], 'nodeBudget': budget,
                 'upstreamConfigPin': self.pin('/run/bootstrap/POSTGREST.PRIVATE.conf')}
        def process(pid, start, exe, parent):
            return {'pid': pid, 'startTicks': start, 'exe': exe, 'parentPID': parent, 'pidNamespace': 'pid:[10]', 'membership': '0::/\n',
                    'uids': [0] * 4, 'gids': [0] * 4, 'capabilitiesZero': True, 'noNewPrivileges': True}
        heartbeat = {'schema': 'helmut-local-unit-native-owner-observation/1', **self.selection,
                     'owner': process(12, '2', self.config['nodePin']['path'], 1), 'upstream': process(13, '3', '/opt/postgrest-pinned', 12),
                     'observedAtUTC': M.utc(), 'actualNodeBudget': budget, 'brokerListenerObserved': True,
                     'measuredCgroup': {'path': '/owned-group', 'device': 1, 'inode': 2},
                     'pins': {'owner': self.aliases['owner']['sha256'], 'broker': self.aliases['broker']['sha256'], 'node': self.config['nodePin']['sha256'],
                              'upstreamExe': self.aliases['postgrest']['sha256'], 'upstreamConfig': ready['upstreamConfigPin']['sha256']}}
        self.host.owner = FakeChild(); self.host.owner.output[0].extend(M.encode(ready) + b'\n')
        self.host._owner_messages(); self.assertTrue(self.host.owner_ready is not None and self.host.heartbeat is None)
        for key in ('uids', 'gids', 'noNewPrivileges', 'capabilitiesZero', 'pidNamespace'):
            bad = copy.deepcopy(heartbeat); bad['owner'][key] = [0, 0, 0, 1000] if key in ('uids', 'gids') else False
            self.host.owner.output[0] = bytearray(M.encode(ready) + b'\n' + M.encode(bad) + b'\n'); self.host.owner_lines = 1
            with self.assertRaises(RuntimeError):
                self.host._owner_messages()
        self.host.owner.output[0] = bytearray(M.encode(ready) + b'\n' + M.encode(heartbeat) + b'\n'); self.host.owner_lines = 1
        self.host._owner_messages(); self.assertTrue(self.host.heartbeat == heartbeat and self.host.last_heartbeat > 0)

    def test_closed_budget_rejects_changed_flags_and_heap(self):
        value = {'nodeVersion': 'v24.19.0', 'execArgv': M.FLAGS, 'oldSpaceMiB': 384, 'semiSpaceMiB': 16, 'heapSizeLimitBytes': 432 * 1024**2}
        M.node_budget(value)
        for change in ({'execArgv': [*M.FLAGS, '--inspect']}, {'nodeVersion': 'v22.0.0'}, {'heapSizeLimitBytes': 512 * 1024**2}, {'semiSpaceMiB': True}):
            with self.assertRaises(RuntimeError):
                M.node_budget({**value, **change})

    def test_actual_process_probe_checks_uid_gid_nnp_caps_namespace_and_lineage(self):
        parent = self.config['parent']; fault = {'key': None}
        fields = ['S', '5', *(['0'] * 17), '123']
        text = '91 (source service) ' + ' '.join(fields)
        class ProcPath:
            def __init__(self, name): self.name = str(name)
            def __truediv__(self, name): return ProcPath(self.name + '/' + str(name))
            def __str__(self): return self.name
            def read_text(self):
                if self.name.endswith('/stat'): return text
                if self.name.endswith('/cgroup'): return '0::/' + ('../' if fault['key']=='namespace-presentation' else '') + (parent if fault['key'] != 'parent' else 'foreign') + '/source\n'
                if self.name.endswith('/status'):
                    return '\n'.join(['Uid:\t' + ('0' if fault['key'] == 'uid' else '1000') + '\t1000\t1000\t1000',
                                      'Gid:\t1000\t1000\t1000\t' + ('0' if fault['key'] == 'gid' else '1000'),
                                      'NSpid:\t91\t7', 'NoNewPrivs:\t' + ('0' if fault['key'] == 'nnp' else '1'),
                                      *[k + ':\t' + ('1' if fault['key'] == 'cap' and k == 'CapEff' else '0') for k in ('CapInh','CapPrm','CapEff','CapBnd','CapAmb')]])
                raise AssertionError('closed-proc-path')
        def link(p):
            name = str(p)
            return '/opt/original/bin/node' if name.endswith('/exe') else name.rsplit('/', 1)[-1] + ':[42]'
        def witness(c, pid, membership):
            M.need(membership in ('0::/' + parent + '/source\n','0::/../'+parent+'/source\n'), 'actual-common-parent')
            return {'containerId':'7'*64,'parent':{'device':1,'inode':2},'leaf':{'device':1,'inode':3}}
        with (patch.object(M, 'Path', ProcPath), patch.object(M.os, 'readlink', side_effect=AssertionError('host-must-not-read-ns-exe')),
              patch('builtins.open', side_effect=lambda *a,**k: io.BytesIO(b'/opt/original/bin/node\0')),
              patch.object(M,'host_cgroup',witness)):
            result = M.host_process(self.config, 91)
            self.assertTrue(result['hostPID'] == 91 and result['namespacePID'] == 7 and result['startTicks'] == '123')
            fault['key']='namespace-presentation'
            self.assertEqual(M.host_process(self.config,91)['membership'],'0::/../'+parent+'/source\n')
            for key in ('uid', 'gid', 'nnp', 'cap', 'parent'):
                fault['key'] = key
                with self.assertRaises(RuntimeError):
                    M.host_process(self.config, 91)

    def cgroup_fixture(self):
        root = self.base / 'synthetic-cgroup'; root.mkdir()
        group = root / self.config['parent']; group.mkdir()
        cid = '7' * 64; leaf = group / cid; leaf.mkdir(); (leaf / 'cgroup.procs').write_bytes(b'91\n92\n')
        s = group.stat(); self.config.update(parentDevice=s.st_dev,parentInode=s.st_ino)
        patch.object(M,'CGROUP_ROOT',root).start()
        return group,leaf,cid

    def test_cgroup_namespace_optional_single_parent_component_requires_real_pid_leaf(self):
        group,leaf,cid = self.cgroup_fixture()
        a=M.host_cgroup(self.config,91,'0::/'+self.config['parent']+'/'+cid+'\n')
        b=M.host_cgroup(self.config,91,'0::/../'+self.config['parent']+'/'+cid+'\n')
        self.assertTrue(a==b and a['containerId']==cid and a['parent']['inode']==group.stat().st_ino
                        and a['leaf']['inode']==leaf.stat().st_ino)

    def test_cgroup_namespace_rejects_all_other_traversal_foreign_or_extra_components(self):
        group,leaf,cid = self.cgroup_fixture(); p=self.config['parent']
        invalid=('0::/../../'+p+'/'+cid+'\n','0::/../foreign/'+cid+'\n','0::/'+p+'/extra/'+cid+'\n',
                 '0::/'+p+'/'+cid+'/extra\n','0::/'+p+'//'+cid+'\n','0::/'+p+'/'+cid+'\n0::/\n',
                 '0::/'+p+'/'+cid,'0::/./'+p+'/'+cid+'\n','0::/\n','0::/'+p+'/'+('G'*64)+'\n')
        for membership in invalid:
            with self.subTest(caseSHA=M.sha(membership)),self.assertRaisesRegex(RuntimeError,'actual-common-parent'):
                M.host_cgroup(self.config,91,membership)

    def test_cgroup_host_pid_must_be_in_exact_leaf_and_parent_inode(self):
        group,leaf,cid=self.cgroup_fixture(); membership='0::/../'+self.config['parent']+'/'+cid+'\n'
        with self.assertRaisesRegex(RuntimeError,'host-pid-in-exact-leaf'): M.host_cgroup(self.config,93,membership)
        self.config['parentInode']+=1
        with self.assertRaisesRegex(RuntimeError,'host-parent-inode'): M.host_cgroup(self.config,91,membership)

    def test_cgroup_member_read_is_bounded_numeric_and_unique(self):
        group,leaf,cid=self.cgroup_fixture(); membership='0::/'+self.config['parent']+'/'+cid+'\n'
        for raw in (b'91\n91\n',b'0\n91\n',b'91 other\n',b'91',b'91\n'+b'2\n'*32768):
            (leaf/'cgroup.procs').write_bytes(raw)
            with self.subTest(size=len(raw)),self.assertRaises(RuntimeError): M.host_cgroup(self.config,91,membership)

    def test_cgroup_leaf_and_members_symlinks_are_not_followed(self):
        group,leaf,cid=self.cgroup_fixture(); membership='0::/'+self.config['parent']+'/'+cid+'\n'
        moved=group/'held-leaf'; leaf.rename(moved); leaf.symlink_to(moved,target_is_directory=True)
        with self.assertRaises(OSError): M.host_cgroup(self.config,91,membership)
        leaf.unlink(); moved.rename(leaf)
        (leaf/'cgroup.procs').rename(leaf/'held-members'); (leaf/'cgroup.procs').symlink_to(leaf/'held-members')
        with self.assertRaises(OSError): M.host_cgroup(self.config,91,membership)

    def test_cgroup_leaf_replacement_during_pid_read_fails(self):
        group,leaf,cid=self.cgroup_fixture(); membership='0::/'+self.config['parent']+'/'+cid+'\n'
        original=M.os.read; changed=[]
        def read(fd,n):
            raw=original(fd,n)
            if raw and not changed:
                leaf.rename(group/'held-leaf'); leaf.mkdir(); (leaf/'cgroup.procs').write_bytes(b'91\n'); changed.append(True)
            return raw
        with patch.object(M.os,'read',read):
            with self.assertRaisesRegex(RuntimeError,'host-cgroup-identity-drift'): M.host_cgroup(self.config,91,membership)

    def observer_fixture(self):
        cid = '7' * 64; command = [self.config['nodePin']['path'], *M.FLAGS, '-e', M.PROCESS_OBSERVER]
        membership = '0::/' + self.config['parent'] + '/' + cid + '\n'
        def host(pid, namespace, start, cmd):
            return {'hostPID': pid, 'namespacePID': namespace, 'startTicks': start, 'nspid': [pid, namespace],
                    'membership': membership, 'command': cmd,
                    'cgroupIdentity':{'containerId':cid,'parent':{'device':1,'inode':2},'leaf':{'device':1,'inode':3}}}
        initial = host(91, 1, '123', ['/fixed/source'])
        remote = host(92, 44, '124', command)
        clock = {'schema': 'helmut-local-unit-monotonic-domain/1', 'kind': 'kernel-without-time-namespaces',
                 'namespace': None, 'bootId': '11111111-1111-1111-1111-111111111111'}
        def inside(h):
            return {'pid': h['namespacePID'], 'startTicks': h['startTicks'], 'uids': [1000] * 4, 'gids': [1000] * 4,
                    'capabilitiesZero': True, 'noNewPrivileges': True, 'nspid': [h['namespacePID']], 'exe': h['command'][0],
                    'namespaces': {**{k: k + ':[42]' for k in ('pid', 'net', 'mnt', 'cgroup')}, 'time': None, 'clockDomain': clock},
                    'membership': '0::/\n'}
        ready = {'schema': 'helmut-local-unit-native-process-observer-ready/1', 'self': inside(remote), 'nodeVersion': 'v24.19.0',
                 'execArgvSHA256': M.sha(M.encode([*M.FLAGS, '-e', M.PROCESS_OBSERVER])), 'heapSizeLimitBytes': 432 * 1024**2}
        class Pipe:
            def __init__(self, argv, **options):
                self.argv = argv; self.options = options; self.output = [bytearray(M.encode(ready) + b'\n'), bytearray()]
                self.done = False; self.supplied = None
            def tick(self): return self.done
            def supply(self, raw):
                if self.supplied is not None: raise AssertionError('double-input')
                self.supplied = M.unique(raw)
            def close_metadata(self):
                if not self.done: raise AssertionError('premature-close')
                return {'exitCode': 0, 'stdoutNaturalEOF': True, 'stderrNaturalEOF': True, 'registeredHostPID': 88}
        row = {'Id': cid, 'Path': '/fixed/source', 'Args': [], 'State': {'Running': True, 'Pid': 91, 'OOMKilled': False, 'ExitCode': 0}}
        self.addCleanup(patch.stopall)
        patch.object(M, 'host_process', lambda c, p: copy.deepcopy({91: initial, 92: remote}[p])).start()
        patch.object(M, 'group_members', lambda *a: {91, 92}).start()
        patch.object(M, 'host_clock_domain', lambda: clock).start()
        patch.object(M, '_PipeChild', Pipe).start()
        patch.object(M, 'owned_docker', lambda *a, **k: types.SimpleNamespace(stdout=json.dumps([row]))).start()
        probe = M.ProcessObserver(self.native, self.config, self.host.directory, row, [initial])
        def finish():
            result = {'schema': 'helmut-local-unit-native-process-observer-result/1', 'requestNonceSHA256': M.sha(probe.nonce),
                      'observedAtUTC': M.utc(), 'self': inside(remote), 'targets': [inside(initial)]}
            probe.child.output[0].extend(M.encode(result) + b'\n'); probe.child.done = True
            return result
        return probe, initial, remote, ready, inside, finish, clock

    def test_observer_binds_live_host_process_before_input_then_actual_close(self):
        probe, initial, remote, ready, inside, finish, clock = self.observer_fixture()
        self.assertIsNone(probe.tick())
        self.assertTrue(probe.child.supplied['targets'] == [{'pid': 1, 'startTicks': '123'}])
        self.assertTrue(probe.remote == remote and probe.child.options['deferred'] is True)
        self.assertTrue(probe.child.argv[:6] == [*M.DOCKER, '--config', self.host.directory, 'exec', '-i'])
        finish(); result = probe.tick()
        self.assertTrue(result['close']['exitCode'] == 0 and result['close']['stdoutNaturalEOF'] and result['close']['stderrNaturalEOF'])
        p = result['processes'][0]
        self.assertTrue(set(p) == {'hostPID', 'namespacePID', 'startTicks', 'exe', 'namespaces', 'membership'}
                        and p['hostPID'] == 91 and p['namespaces']['time'] is None and p['namespaces']['clockDomain'] == clock)
        self.assertNotIn(probe.nonce, json.dumps(result))

    def test_observer_cannot_supply_with_foreign_live_pid_or_command(self):
        probe, initial, remote, ready, inside, finish, clock = self.observer_fixture()
        remote['command'] = ['/foreign']
        with self.assertRaisesRegex(RuntimeError, 'observer-unique-live-host-mapping'):
            probe.tick()
        self.assertIsNone(probe.child.supplied)

    def test_observer_requires_filesystem_witness_cid_equal_actual_docker_cid(self):
        probe,initial,remote,ready,inside,finish,clock=self.observer_fixture()
        initial['cgroupIdentity']['containerId']='8'*64
        row={'Id':probe.cid,'Path':'/fixed/source','Args':[],'State':{'Running':True,'Pid':91}}
        with self.assertRaisesRegex(RuntimeError,'observer-container-init-pid'):
            M.ProcessObserver(self.native,self.config,self.host.directory,row,[copy.deepcopy(initial)])

    def test_only_exact_source_shell_exec_transition_is_accepted(self):
        probe, initial, remote, ready, inside, finish, clock = self.observer_fixture()
        cid = self.config['actualSourceContainerId']; python = '/fixed/python'
        worker = str(Path(self.config['repository']) / 'scripts/helmut-resource-meter/local-unit-native-worker.py')
        self.config.update(pythonExecutable=python, sources=[self.pin(worker)])
        initial['command'] = [python, '-I', '-S', '-B', worker]
        initial['membership'] = '0::/' + self.config['parent'] + '/' + cid + '\n'
        initial['cgroupIdentity']['containerId'] = cid
        shell = 'exec ' + python + ' -I -S -B ' + worker + ' > /bench/BOOTSTRAP.PRIVATE.log 2>&1'
        row = {'Id': cid, 'Path': '/bin/sh', 'Args': ['-c', shell], 'State': {'Running': True, 'Pid': 91}}
        M.ProcessObserver(self.native, self.config, self.host.directory, row, [copy.deepcopy(initial)])
        for args in (['-c', shell + '; other'], ['-c', shell.replace('2>&1', '2>/other')]):
            with self.subTest(argsHash=M.sha(M.encode(args))), self.assertRaisesRegex(RuntimeError, 'source-fixed-exec-command'):
                M.ProcessObserver(self.native, self.config, self.host.directory, {**row, 'Args': args}, [copy.deepcopy(initial)])
        with self.assertRaisesRegex(RuntimeError, 'observer-direct-command'):
            M.ProcessObserver(self.native, self.config, self.host.directory,
                              {**row, 'Id': '8' * 64}, [copy.deepcopy(initial)])

    def test_observer_rejects_changed_target_after_genuine_response(self):
        probe, initial, remote, ready, inside, finish, clock = self.observer_fixture()
        probe.tick(); finish(); initial['startTicks'] = '999'
        with self.assertRaisesRegex(RuntimeError, 'observer-container-drift'):
            probe.tick()

    def test_observer_eof_and_nonzero_exit_cannot_be_repaired(self):
        probe, initial, remote, ready, inside, finish, clock = self.observer_fixture()
        probe.tick(); finish()
        probe.child.close_metadata = lambda: {'exitCode': 137, 'stdoutNaturalEOF': True, 'stderrNaturalEOF': True}
        with self.assertRaisesRegex(RuntimeError, 'observer-actual-success-close'):
            probe.tick()

    def test_observer_missing_natural_eof_is_never_accepted(self):
        probe, initial, remote, ready, inside, finish, clock = self.observer_fixture()
        probe.tick(); finish()
        probe.child.close_metadata = lambda: {'exitCode': 0, 'stdoutNaturalEOF': True, 'stderrNaturalEOF': False}
        with self.assertRaisesRegex(RuntimeError, 'observer-actual-success-close'): probe.tick()

    def test_only_real_missing_time_namespace_allows_kernel_clock_witness(self):
        boot = '11111111-1111-1111-1111-111111111111'
        with patch.object(M.Path, 'read_text', return_value=boot + '\n'):
            with patch.object(M.os, 'readlink', side_effect=FileNotFoundError()):
                clock = M.host_clock_domain()
                self.assertTrue(clock['namespace'] is None and clock['kind'] == 'kernel-without-time-namespaces' and clock['bootId'] == boot)
            with patch.object(M.os, 'readlink', side_effect=PermissionError()):
                with self.assertRaises(PermissionError): M.host_clock_domain()
            with patch.object(M.os, 'readlink', return_value='time:[42]'):
                self.assertTrue(M.host_clock_domain()['namespace'] == 'time:[42]')

    def test_installer_mounts_node_and_waits_for_actual_observer_before_supply(self):
        group = self.base / 'group'; group.mkdir(); g = group.stat()
        self.config.update(parentDevice=g.st_dev, parentInode=g.st_ino)
        alias_dir = self.case / 'owner-public'; alias_dir.mkdir()
        cid = '9' * 64; snapshots = {}; calls = []; events = []
        public = [(key, pin, self.aliases[key]['path'], 0o555 if key == 'postgrest' else 0o444)
                  for key, pin in [('owner', self.pin('/fixed/owner')), ('broker', self.pin('/fixed/broker')),
                                   ('postgrest', self.pin('/fixed/postgrest'))]]
        observed = {'hostPID': 91, 'namespacePID': 1, 'startTicks': '123', 'exe': '/opt/python/bin/python3.12',
                    'namespaces': {'pid': 'pid:[42]'}, 'membership': '0::/' + self.config['parent'] + '/' + cid + '\n'}
        class Installer:
            def __init__(this, argv, **options):
                this.argv = argv; this.options = options; this.done = False; this.supplied = None
                this.output = [bytearray(M.encode({'schema': 'helmut-local-unit-alias-installer-ready/1', 'pid': 1,
                    'startTicks': '123', 'pidNamespace': 'pid:[42]'}) + b'\n'), bytearray()]
                this.child = types.SimpleNamespace(poll=lambda: 0 if this.done else None, stdin=None, stdout=None, stderr=None)
                this.selector = types.SimpleNamespace(close=lambda: None); snapshots['pipe'] = this
            def tick(this): return this.done
            def supply(this, raw):
                events.append('supply'); this.supplied = M.unique(raw); this.done = True
                this.output[0].extend(M.encode({'schema': 'helmut-local-unit-alias-installer-result/1',
                    'files': [{'path': '/output/' + key, 'bytes': p['bytes'], 'sha256': p['sha256']} for key,p,_,_ in public]}) + b'\n')
            def close_metadata(this): return {'exitCode': 0, 'stdoutNaturalEOF': True, 'stderrNaturalEOF': True}
        class Observer:
            def __init__(this, *args): this.calls = 0
            def tick(this):
                this.calls += 1
                if this.calls == 1: events.append('pending'); return None
                events.append('observed-zero-two-eof')
                return {'processes': [observed], 'close': {'exitCode': 0, 'stdoutNaturalEOF': True, 'stderrNaturalEOF': True}}
        def docker(native, directory, argv, **options):
            calls.append(argv)
            if argv[0] == 'create':
                mounts = []
                for i, item in enumerate(argv):
                    if item == '--mount':
                        parts = argv[i+1].split(','); parts_dict = dict(p.split('=',1) for p in parts if '=' in p)
                        mounts.append({'Destination': parts_dict['dst'], 'Source': parts_dict['src'], 'Type': 'bind',
                                       'RW': 'readonly' not in parts, 'Propagation': 'rprivate'})
                snapshots['mounts'] = mounts
                return types.SimpleNamespace(stdout=cid)
            if argv[0] == 'inspect':
                done = snapshots['pipe'].done
                return types.SimpleNamespace(stdout=json.dumps([{'Id': cid, 'Image': self.config['runtime']['imageId'],
                    'Config': {'User': '1000:1000', 'Env': ['HOSTNAME']}, 'HostConfig': {'CgroupParent': '/' + self.config['parent'],
                    'CgroupnsMode': 'private', 'NetworkMode': 'none', 'ReadonlyRootfs': True, 'CapDrop': ['ALL'], 'CapAdd': None,
                    'Privileged': False, 'SecurityOpt': ['no-new-privileges']}, 'Mounts': snapshots['mounts'],
                    'State': {'Running': not done, 'Pid': 91 if not done else 0, 'ExitCode': 0, 'OOMKilled': False}}]))
            raise AssertionError('unexpected-command')
        with (patch.object(M, 'owned_docker', docker), patch.object(M, '_PipeChild', Installer),
              patch.object(M, 'ProcessObserver', Observer), patch.object(M, 'dispose_observer', lambda *a: True),
              patch.object(M, 'host_process', lambda *a: {'command': ['/opt/python/bin/python3.12','-I','-S','-B','-c',M.INSTALLER]}),
              patch.object(M.time, 'sleep', lambda *a: None)):
            result = M._install_aliases(self.native, self.supervisor, self.config, alias_dir, public, group, self.host.directory)
        self.assertTrue(events == ['pending', 'observed-zero-two-eof', 'supply'] and result['observerProcessClose']['exitCode'] == 0)
        self.assertTrue(any(m['Source'] == self.config['nodePin']['path'] and not m['RW'] for m in snapshots['mounts']))
        self.assertTrue('--interactive' in snapshots['pipe'].argv and '--config' in snapshots['pipe'].argv and 'HOSTNAME' in calls[0])

    def test_observer_rejects_wrong_clock_boot_and_fake_namespace(self):
        probe, initial, remote, ready, inside, finish, clock = self.observer_fixture()
        for key in ('boot', 'fake-time', 'uid', 'cap'):
            value = inside(initial); value['namespaces'] = copy.deepcopy(value['namespaces'])
            if key == 'boot': value['namespaces']['clockDomain']['bootId'] = '22222222-2222-2222-2222-222222222222'
            if key == 'fake-time': value['namespaces']['time'] = 'time:[1]'
            if key == 'uid': value['uids'][-1] = 0
            if key == 'cap': value['capabilitiesZero'] = False
            with self.subTest(key=key), self.assertRaises(RuntimeError): probe._inside(value, initial)

    def test_observer_unknown_or_unqualified_target_gone_fails(self):
        probe, initial, remote, ready, inside, finish, clock = self.observer_fixture()
        probe.tick(); result = finish(); result['targets'] = [{'pid': 1, 'startTicks': '123', 'gone': True}]
        probe.child.output[0] = bytearray(M.encode(ready) + b'\n' + M.encode(result) + b'\n')
        with self.assertRaisesRegex(RuntimeError, 'observer-unqualified-target-gone'):
            probe.tick()

    def test_process_cache_requires_current_host_metadata_and_three_second_ttl(self):
        probe, initial, remote, ready, inside, finish, clock = self.observer_fixture()
        value = probe._inside(inside(initial), initial)
        self.host.process_cache[91] = {'host': copy.deepcopy(initial), 'value': value, 'at': M.time.monotonic(), 'cid': probe.cid}
        self.assertEqual(self.host._proc(91, 1000), value)
        self.host.process_cache[91]['at'] -= 3
        with self.assertRaises(M.ObservationPending): self.host._proc(91, 1000)
        self.host.process_cache[91]['at'] = M.time.monotonic(); initial['command'] = ['/changed']
        with self.assertRaises(M.ObservationPending): self.host._proc(91, 1000)

    def test_reap_never_restarts_cache_freshness(self):
        probe, initial, remote, ready, inside, finish, clock = self.observer_fixture()
        probe.tick(); probe.began = M.time.monotonic() - 2.8; finish()
        result = probe.tick()
        self.assertEqual(result['observedAt'], probe.began)
        self.host.process_cache[91] = {'host': initial, 'value': result['processes'][0], 'at': result['observedAt'], 'cid': probe.cid}
        with patch.object(M.time, 'monotonic', return_value=probe.began + 3.01):
            with self.assertRaises(M.ObservationPending): self.host._proc(91, 1000)

    def test_current_result_utc_cannot_rescue_expired_probe(self):
        probe, initial, remote, ready, inside, finish, clock = self.observer_fixture()
        probe.tick(); probe.began -= 3.1; finish()
        with self.assertRaisesRegex(RuntimeError, 'observer-total-freshness'): probe.tick()

    def owner_handoff_fixture(self):
        self.host.source_identity = {'namespaces': {'pid': 'pid:[42]'}}
        binding = {'containerId': self.host.source_id, 'pidNamespace': 'pid:[42]', 'hmacKeySHA256': M.sha(bytes.fromhex('a' * 64))}
        q = {**self.selection, 'database': 'helmut_unit_diagnostic_' + self.nonce, 'publicSourceBinding': binding}
        files = [{'path': '/run/bootstrap/READ_' + key + '.PRIVATE.json', 'text': '{"public":true}'} for key in ('A','B','C','D','E','F')]
        rpcs = [{'name': name, 'qualificationPin': self.pin(row['path'], row['text'].encode())} for name, row in zip(
                ('helmut_auth_state_graph_read_v1','helmut_auth_usage_read_v1'), files)]
        start = {**self.selection, 'database': q['database'], 'originalService': {'publicSourceBinding': binding,
                 'sourceQualificationPin': self.pin('/run/bootstrap/SOURCE_QUALIFICATION.PRIVATE.json', M.encode(q))},
                 'pins': {**self.aliases, 'node': self.config['nodePin']}, 'shutdownPolicySources': self.plan['shutdownPolicyPins'],
                 'measuredCgroup': {'path':'/owned-group','device':1,'inode':2,'procMembership':'0::/\n'}, 'legacy':{'rpcs':rpcs}}
        handoff = {'start':start,'sourceQualification':q,'hmacKeyHex':'a'*64,'readQualifications':files,
                   'publicationPolicy':'p'*493,'immutableClientPins':[]}
        patch.object(M, 'POLICY_SHA', M.sha(handoff['publicationPolicy'])).start()
        self.host._client_files = lambda *a: None
        return handoff

    def test_first_owner_start_waits_for_real_service_observation_without_replay(self):
        handoff = self.owner_handoff_fixture(); calls = []
        self.host._root = lambda *a, **k: calls.append(a) or FakeChild()
        self.host._source_service = lambda *a: (_ for _ in ()).throw(M.ObservationPending())
        request = self.request('OWNER_START', {'handoff':handoff})
        self.host._accept(request, '1' * 64)
        self.assertTrue(self.host.pending_handoff is handoff and self.host.handoff is None and not calls)
        self.host._observe = lambda: (_ for _ in ()).throw(M.ObservationPending())
        self.host.tick(); self.assertTrue(self.host.failure is None and not calls and self.host.owner is None)
        with self.assertRaisesRegex(RuntimeError, 'request-already-pending'): self.host._accept(request, '1' * 64)
        self.host._observe = lambda: {'sourceService':{'genuine':'simulated-actual-zero-two-eof'}}
        self.host._source_service = lambda *a: {'genuine':'simulated-actual-zero-two-eof'}
        self.host.tick(); self.host.tick()
        self.assertTrue(len(calls)==1 and self.host.handoff is handoff and self.host.pending_handoff is None and self.host.failure is None)

    def test_first_owner_start_unknown_service_never_bootstraps(self):
        handoff = self.owner_handoff_fixture(); calls = []
        self.host._root = lambda *a, **k: calls.append(a) or FakeChild()
        self.host._accept(self.request('OWNER_START',{'handoff':handoff}), '1' * 64)
        self.host._observe = lambda: M.need(False, 'source-service-host-mapping')
        with self.assertRaisesRegex(RuntimeError, 'sealed-failure'): self.host.tick()
        self.assertTrue(not calls and self.host.handoff is None and self.host.owner is None)

    def test_pending_owner_handoff_queues_source_and_service_in_one_probe(self):
        handoff = self.owner_handoff_fixture()
        self.host._accept(self.request('OWNER_START', {'handoff':handoff}), '1' * 64)
        group = self.base / 'group'; group.mkdir(); g = group.stat()
        self.config.update(parentDevice=g.st_dev, parentInode=g.st_ino)
        self.native.parent_path = lambda *a: group
        row = {'Id':self.host.source_id,'HostConfig':{'CgroupParent':'/'+self.config['parent']},'State':{'Running':True,'Pid':91}}
        self.host._docker = lambda args, **kw: inventory_fixture_output(args, [row])
        self.host._container = self.host._mounts = lambda *a: None
        source, service = {'hostPID':91}, {'hostPID':92}; queued=[]
        self.host._service_host = lambda binding: service
        self.host._probe = lambda row, targets: queued.append(targets)
        self.host._proc = lambda *a: (_ for _ in ()).throw(M.ObservationPending())
        with patch.object(M,'host_process',return_value=source):
            with self.assertRaises(M.ObservationPending): self.host._observe()
        self.assertTrue(queued==[[source,service]] and self.host.handoff is None and self.host.owner is None)

    def test_pending_observer_is_not_failure_and_does_not_accept_request(self):
        self.host._observe = lambda: (_ for _ in ()).throw(M.ObservationPending())
        result = self.host.tick()
        self.assertTrue(result['observation'] is None and self.host.failure is None)

    def test_refresh_is_bounded_and_reuses_fresh_identity(self):
        probe, initial, remote, ready, inside, finish, clock = self.observer_fixture()
        row = {'Id': probe.cid}
        self.host.process_cache[91] = {'host': copy.deepcopy(initial), 'value': {}, 'at': M.time.monotonic(), 'cid': probe.cid}
        with patch.object(M, 'ProcessObserver', side_effect=AssertionError('no-extra-exec')):
            self.host._probe(row, [initial]); self.assertTrue(not self.host.probes)
        self.host.process_cache[91]['at'] -= 2
        pumps=[]
        with patch.object(M, 'ProcessObserver', return_value=probe),patch.object(self.host,'_pump_probe',pumps.append):
            self.host._probe(row, [initial]); self.host._probe(row, [initial])
        self.assertTrue(self.host.observer_count == 1 and self.host.probes[probe.cid] is probe and pumps==[probe.cid])

    def test_fixed_observer_handshake_finishes_before_slow_outer_inventory(self):
        probe,initial,remote,ready,inside,finish,clock=self.observer_fixture()
        now={'t':probe.began}; phases=[]
        self.host.probes[probe.cid]=probe
        def pause(seconds):
            self.assertEqual(seconds,.005); now['t']+=seconds
            self.assertTrue(probe.child.supplied is not None)
            phases.append('nonce-written-next-fixed-pump'); finish()
        with (patch.object(M.time,'monotonic',lambda:now['t']),patch.object(M.time,'sleep',pause),
              patch.object(M,'dispose_observer',lambda *a:True)):
            self.host._pump_probe(probe.cid)
            self.assertTrue(probe.cid not in self.host.probes and len(self.host.observer_closes)==1)
            self.assertEqual(self.host.process_cache[91]['at'],probe.began)
            phases.append('slow-outer-inventory');now['t']+=1.8
            self.assertTrue(self.host._proc(91,1000)['startTicks']=='123')
        self.assertEqual(phases,['nonce-written-next-fixed-pump','slow-outer-inventory'])

    def test_fixed_observer_pump_keeps_original_three_second_deadline(self):
        probe,initial,remote,ready,inside,finish,clock=self.observer_fixture()
        self.host.probes[probe.cid]=probe
        with patch.object(M.time,'monotonic',return_value=probe.began+3):
            with self.assertRaisesRegex(RuntimeError,'observer-total-freshness'):self.host._pump_probe(probe.cid)
        self.assertTrue(not self.host.process_cache and not self.host.observer_closes and probe.cid in self.host.probes)

    def test_fixed_observer_nonzero_pump_retains_metadata_and_never_caches(self):
        probe,initial,remote,ready,inside,finish,clock=self.observer_fixture()
        probe.tick();finish()
        probe.child.registeredPID=88;probe.child.offset=0;probe.child.input_size=99;probe.child.eof=[True,True]
        probe.child.child=types.SimpleNamespace(poll=lambda:137)
        probe.child.close_metadata=lambda:{'exitCode':137,'stdoutNaturalEOF':True,'stderrNaturalEOF':True}
        self.host.probes[probe.cid]=probe
        with self.assertRaisesRegex(RuntimeError,'observer-actual-success-close') as context:self.host._pump_probe(probe.cid)
        metadata=context.exception.nativeProcessObserverFailure
        self.assertTrue(metadata['localExitCode']==137 and metadata['remoteExitConfirmed'] is False
                        and metadata['registeredHostPID']==88 and metadata['inputWrittenBytes']==0)
        self.assertTrue(not self.host.process_cache and not self.host.observer_closes)

    def test_owned_create_has_closed_env_and_empty_config_not_host_proxy(self):
        captured = []
        with patch.object(M.subprocess, 'run', lambda argv, **kw: captured.append((argv, kw)) or 'created'):
            result = M.owned_docker(self.native, self.host.directory, ['create', '--env', 'HOSTNAME', 'fixed-image'], timeout=7)
        argv, options = captured[0]
        self.assertEqual(result, 'created')
        self.assertTrue(argv == [*M.DOCKER, '--config', self.host.directory, 'create', '--env', 'HOSTNAME', 'fixed-image']
                        and options['env'] == M.ENV and 'HOSTNAME' not in options['env'] and options['check'] is True)
        self.assertTrue(options['timeout'] == 7 and options['capture_output'] and options['text'])

    def test_owned_docker_config_is_fresh_exact_private_and_immutable_shape(self):
        directory = Path(self.host.directory)
        self.assertTrue(directory.stat().st_mode & 0o777 == 0o700 and (directory / 'config.json').read_bytes() == b'{}')
        with self.assertRaises(FileExistsError): M.docker_config(self.case)
        (directory / 'config.json').write_bytes(b'{"proxies":{}}')
        with self.assertRaises(RuntimeError): M.docker_prefix(directory)

    def test_initial_gate_is_once_after_observer_close_and_fixed_wire_order(self):
        probe, initial, remote, ready, inside, finish, clock = self.observer_fixture()
        value = probe._inside(inside(initial), initial); delivered = []
        child = types.SimpleNamespace(supply=lambda raw: delivered.append(raw))
        self.host.selection = dict(reversed(list(self.selection.items())))
        self.host.clients[probe.cid] = {'process': value, 'child': child}
        self.host.process_cache[91] = {'host': initial, 'value': value, 'at': M.time.monotonic(), 'cid': probe.cid}
        self.host.probes[probe.cid] = probe; self.host._release_clients(); self.assertTrue(not delivered)
        self.host.probes.clear(); self.host._release_clients(); self.host._release_clients()
        frame = M.unique(delivered[0]); self.assertTrue(len(delivered) == 1 and delivered[0].endswith(b'\n'))
        self.assertEqual(list(frame['selection']), ['operationId', 'commandHash'])
        self.assertTrue(frame['process'] == {'pid': 1, 'startTicks': '123'} and frame['schema'].endswith('/1'))

    def test_exit_release_waits_for_marker_and_all_real_observer_closes(self):
        probe, initial, remote, ready, inside, finish, clock = self.observer_fixture()
        value = probe._inside(inside(initial), initial)
        self.host.clients[probe.cid] = {'mode': 'entry', 'process': value, 'gateReleased': True}
        self.host.process_cache[91] = {'host': initial, 'value': value, 'at': M.time.monotonic(), 'cid': probe.cid}
        now = datetime.datetime.now(datetime.timezone.utc)
        ready_frame = {'schema': 'helmut-local-unit-native-observation-exit-ready/1', 'selection': self.selection,
                       'process': {'pid': 1, 'startTicks': '123'}, 'issuedAtUTC': now.isoformat(timespec='milliseconds').replace('+00:00','Z'),
                       'expiresAtUTC': (now + datetime.timedelta(seconds=8)).isoformat(timespec='milliseconds').replace('+00:00','Z'), 'nonce': 'f' * 64}
        path = self.case / 'client/ENTRY_OBSERVATION_EXIT_READY.SAFE.json'
        M.write_once(path, M.encode(ready_frame) + b'\n')
        with patch.object(M, 'exit_published', return_value=False): self.host._quiesce_clients()
        self.assertNotIn('exitReady', self.host.clients[probe.cid])
        self.host.probes[probe.cid] = probe
        with (patch.object(M, 'exit_published', return_value=True),
              patch.object(M, 'read_file', return_value=(path.read_bytes(), self.pin(str(path), path.read_bytes())))):
            self.host._quiesce_clients(); self.assertEqual(self.host.quiescing_client, probe.cid)
            self.assertFalse((path.parent / 'ENTRY_OBSERVATION_EXIT_RELEASE.SAFE.json').exists())
            self.host.probes.clear(); self.host._quiesce_clients()
        release = M.unique((path.parent / 'ENTRY_OBSERVATION_EXIT_RELEASE.SAFE.json').read_bytes())
        self.assertTrue(release['readyNonceSHA256'] == M.sha('f' * 64) and self.host.quiescing_client is None
                        and self.host.clients[probe.cid]['exitReleased'])

    def test_client_immutable_files_cannot_select_source_private_environment(self):
        p = self.pin(str(M.SOURCE / 'native-end-preparation/runtime-candidates/generated-materials/EXECUTION_ENV.PRIVATE.json'))
        with self.assertRaisesRegex(RuntimeError, 'client-file-target'):
            self.host._client_files([{'logical': p, 'physical': p}] * 10)

    def test_volume_mount_subpath_is_verified_not_only_volume_name(self):
        row = {'Mounts': [{'Type': 'volume', 'Destination': M.PUBLIC, 'Name': 'run-own', 'RW': False}],
               'HostConfig': {'Mounts': [{'Type': 'volume', 'Target': M.PUBLIC, 'Source': 'run-own', 'ReadOnly': True,
                                         'VolumeOptions': {'Subpath': 'helmut-local-unit-diagnostic'}}]}}
        self.host._mounts(row, [], {M.PUBLIC: ('run-own', True)})
        row['HostConfig']['Mounts'][0]['VolumeOptions']['Subpath'] = ''
        with self.assertRaises(RuntimeError):
            self.host._mounts(row, [], {M.PUBLIC: ('run-own', True)})

    def test_bind_closure_and_readonly_are_exact(self):
        row = {'Mounts': [{'Type': 'bind', 'Destination': '/a', 'Source': '/b', 'RW': False, 'Propagation': 'rprivate'}], 'HostConfig': {'Mounts': []}}
        self.host._mounts(row, [('/b', '/a', True)], {})
        for expected in ([], [('/b', '/a', False)], [('/wrong', '/a', True)]):
            with self.assertRaises(RuntimeError):
                self.host._mounts(row, expected, {})

    def test_foreign_container_inside_common_parent_is_not_ignored(self):
        group = self.base / 'group'; group.mkdir(); g = group.stat()
        self.config.update(parentDevice=g.st_dev, parentInode=g.st_ino)
        self.native.parent_path = lambda _: group
        rows = [{'Id': x * 64, 'HostConfig': {'CgroupParent': '/' + self.config['parent']}} for x in ('d', '9')]
        self.host._docker = lambda argv, **k: inventory_fixture_output(argv, rows)
        with self.assertRaisesRegex(RuntimeError, 'unknown-or-missing-owned-container'):
            self.host._observe()

    def test_common_parent_directory_identity_cannot_be_rebound(self):
        group = self.base / 'group'; group.mkdir(); self.native.parent_path = lambda _: group
        self.config.update(parentDevice=group.stat().st_dev, parentInode=group.stat().st_ino + 1)
        with self.assertRaisesRegex(RuntimeError, 'actual-parent-directory'):
            self.host._observe()

    def test_closed_environment_permutations_preserve_exact_entries(self):
        expected = ['HOSTNAME', 'PATH=/usr/bin:/bin', 'LANG=C.UTF-8', 'LC_ALL=C.UTF-8', 'TZ=UTC',
                    'HOME=/tmp', 'TMPDIR=/tmp', 'HELMUT_STORAGE_BACKEND=supabase',
                    'SUPABASE_URL=http://127.0.0.1:3000', 'HELMUT_LOCAL_UNIT_DIAGNOSTIC_DATABASE=helmut_unit_diagnostic_' + self.nonce,
                    'HELMUT_NATIVE_NODE_OLD_SPACE_MIB=384']
        for values in (expected, [*expected, 'HELMUT_PUBLICATION_ELIGIBILITY_JSON={"synthetic":"a=b"}']):
            original = values[:]
            for offset in range(len(values)):
                actual = values[offset:] + values[:offset]
                before = actual[:]
                self.assertTrue(M.closed_environment(actual, values))
                self.assertTrue(M.closed_environment(list(reversed(actual)), values))
                self.assertEqual(actual, before)
            self.assertEqual(values, original)

    def test_closed_environment_rejects_missing_extra_changed_duplicate_and_marker(self):
        expected = ['HOSTNAME', 'PATH=/usr/bin:/bin', 'HOME=/tmp', 'TZ=UTC']
        cases = {
            'missing': expected[:-1], 'extra': [*expected, 'HTTP_PROXY=http://synthetic.invalid'],
            'value-change': ['HOSTNAME', 'PATH=/bin', 'HOME=/tmp', 'TZ=UTC'],
            'duplicate-same': [*expected, 'PATH=/usr/bin:/bin'],
            'duplicate-name-different-value': ['HOSTNAME', 'PATH=/usr/bin:/bin', 'HOME=/tmp', 'PATH=/bin'],
            'duplicate-marker': [*expected, 'HOSTNAME'], 'marker-empty-value': ['HOSTNAME=', *expected[1:]],
            'marker-value': ['HOSTNAME=synthetic', *expected[1:]], 'marker-and-value': [*expected, 'HOSTNAME='],
            'other-bare-name': ['HOSTNAME', 'PATH', 'HOME=/tmp', 'TZ=UTC'],
            'invalid-name': ['HOSTNAME', '=value', 'HOME=/tmp', 'TZ=UTC'],
            'nul': ['HOSTNAME', 'PATH=/usr/bin:/bin\0', 'HOME=/tmp', 'TZ=UTC'],
            'non-string': ['HOSTNAME', 1, 'HOME=/tmp', 'TZ=UTC'], 'non-list': tuple(expected), 'null': None,
        }
        for label, actual in cases.items():
            with self.subTest(case=label):
                self.assertFalse(M.closed_environment(actual, expected))
                self.assertFalse(M.closed_environment(expected, actual))
                if label not in ('missing', 'extra', 'value-change'):
                    self.assertFalse(M.closed_environment(actual, actual))
        self.assertFalse(M.closed_environment([], []))
        self.assertFalse(M.closed_environment(expected[1:], expected[1:]))

    def test_live_client_inspection_accepts_reordering_but_keeps_command_binding(self):
        group = self.base / 'group'; group.mkdir(); g = group.stat()
        self.config.update(parentDevice=g.st_dev, parentInode=g.st_ino)
        cid = '7' * 64
        environment = ['HOSTNAME', 'PATH=/usr/bin:/bin', 'HOME=/tmp']
        args = [*M.FLAGS, '/public/qualifier.js', '--selector', '/public/SELECTION.SAFE.json']
        source = {'Id': self.host.source_id, 'HostConfig': {'CgroupParent': '/' + self.config['parent']},
                  'State': {'Running': True, 'Pid': 91}}
        client = {'Id': cid, 'HostConfig': {'CgroupParent': '/' + self.config['parent']},
                  'State': {'Running': False, 'ExitCode': 0}, 'Config': {'Env': list(reversed(environment))},
                  'Path': self.config['nodePin']['path'], 'Args': args[:]}
        self.host.clients[cid] = {'mode': 'qualifier', 'mounts': [], 'environment': environment, 'args': args}
        self.host._docker = lambda argv, **k: inventory_fixture_output(argv, [source, client])
        with (patch.object(self.host, '_container'), patch.object(self.host, '_mounts'),
              patch.object(self.host, '_probe'), patch.object(self.host, '_proc', return_value={'hostPID': 91}),
              patch.object(M, 'host_process', return_value={'hostPID': 91})):
            self.host._observe()
            for field, value in (('Config', {'Env': ['HOSTNAME=', *environment[1:]]}),
                                 ('Path', '/unbound/node'), ('Args', [*args, '--extra'])):
                original = client[field]; client[field] = value
                with self.subTest(field=field), self.assertRaisesRegex(RuntimeError, 'actual-client-command-environment'):
                    self.host._observe()
                client[field] = original

    def test_client_environment_modes_and_mounts_are_closed(self):
        repo = Path(self.config['repository'])
        for name in ('local-unit-native-endpoint-qualification.js', 'local-unit-native-run.js'):
            self.config['sourceCodePins'].append(self.pin(str(repo / 'scripts/helmut-resource-meter' / name)))
        self.host.client_pins = []; self.host.client_immutable_mounts = []
        self.host.handoff = {'publicationPolicy': 'policy-field'}
        (self.case / 'client/ENDPOINT_QUALIFICATION_CONFIG.PRIVATE.json').write_text('{}')
        captured = []
        def docker(argv, **opts):
            if argv[:2] == ['image', 'inspect']:
                return types.SimpleNamespace(stdout='[{"Config":{"Env":null}}]')
            captured.append(argv); return types.SimpleNamespace(stdout=('7' if len(captured) == 1 else '8') * 64)
        self.host._docker = docker; self.host._child = lambda *a, **k: FakeChild(*a, **k)
        self.host._client('qualifier'); self.host._client('entry')
        q, e = captured
        self.assertTrue(not any('PUBLICATION' in x or 'AUTH_STATE' in x or 'CONTROL_READ' in x for x in q))
        self.assertTrue('HELMUT_AUTH_GRAPH_READ_REUSE=off' in e and 'HELMUT_AUTH_SINGLE_WRITE_CAPTURE=off' in e
                        and 'HELMUT_AUTH_CONTROL_READ=verified-control-view-v1' in e and 'HELMUT_LOCAL_PIPELINE_LOCK_MODE=invocation-lease-v1' in e)
        self.assertTrue('container:' + self.host.source_id in q and 'volume-subpath=helmut-local-unit-diagnostic,readonly' in ' '.join(q))
        self.assertTrue(not any('docker.sock' in x or 'PGDATA' in x or 'HMAC' in x or 'dst=/bench' in x for x in q))
        self.assertTrue(all(flag in q and flag in e for flag in M.FLAGS))
        self.assertTrue(any('dst=/opt/postgrest-pinned,readonly' in x for x in q) and any('dst=/opt/python/bin/python3.12,readonly' in x for x in q))

    def test_private_extra_file_in_client_folder_is_blocked(self):
        self.config['sourceCodePins'] = [self.pin(str(Path(self.config['repository']) / 'scripts/helmut-resource-meter/local-unit-native-run.js'))]
        self.host.client_pins = []; self.host.client_immutable_mounts = []; self.host.handoff = {'publicationPolicy': 'policy'}
        (self.case / 'client/PREPARED_COMMAND.PRIVATE.json').write_text('{}')
        with self.assertRaisesRegex(RuntimeError, 'unqualified-client-directory-content'):
            self.host._client('entry')

    def test_client_output_is_never_close_success_without_process_capture(self):
        class Closed:
            def tick(self): return True
            def close_metadata(self): return {'exitCode': 0, 'stdoutNaturalEOF': True, 'stderrNaturalEOF': True}
        self.host.active_client = '7' * 64
        c = {'child': Closed(), 'row': {'State': {'Running': False, 'ExitCode': 0, 'OOMKilled': False}}}
        self.host.clients[self.host.active_client] = c
        with self.assertRaisesRegex(RuntimeError, 'actual-client-success-close'):
            self.host._client_result()
        c['row']['State']['Running'] = True
        self.assertTrue(self.host._client_result() is None)


class PurePipes(unittest.TestCase):
    def setUp(self):
        self.addCleanup(patch.stopall)
        self.created = []
        def factory(*a, **k):
            p = FakePopen(*a, **k); self.created.append(p); return p
        patch.object(M.subprocess, 'Popen', factory).start()
        patch.object(M.selectors, 'DefaultSelector', FakeSelector).start()
        patch.object(M.os, 'set_blocking', lambda *a: None).start()
        self.blocks = {10: [b'output', b''], 11: [b'']}; self.written = bytearray()
        patch.object(M.os, 'read', lambda fd, n: self.blocks[fd].pop(0)).start()
        def write(fd, raw):
            n = min(3, len(raw)); self.written.extend(raw[:n]); return n
        patch.object(M.os, 'write', write).start()

    def test_bidirectional_partial_stdin_natural_eof_and_exit(self):
        c = M._PipeChild(['fixed'], b'private-stdin')
        for _ in range(6):
            c.tick()
        self.assertTrue(c.eof == [True, True] and c.child.stdin.closed)
        with self.assertRaises(RuntimeError):
            c.close_metadata()
        c.child.returncode = 0; self.assertTrue(c.tick()); meta = c.close_metadata()
        self.assertTrue(meta['exitCode'] == 0 and meta['stdoutNaturalEOF'] and meta['stderrNaturalEOF'])
        self.assertTrue(bytes(self.written) == b'private-stdin' and c.selector.closed and c.tick())

    def test_actual_exit_without_eof_is_not_success(self):
        c = M._PipeChild(['fixed']); c.child.returncode = 0
        with self.assertRaises(RuntimeError):
            c.close_metadata()

    def test_install_payload_is_deferred_until_actual_process_observation(self):
        c = M._PipeChild(['fixed-installer'], deferred=True)
        c.tick(); self.assertTrue(not self.written and not c.child.stdin.closed and c.deferred)
        c.supply(b'public-pin-list')
        with self.assertRaisesRegex(RuntimeError, 'single-deferred-input'):
            c.supply(b'again')
        for _ in range(5):
            c.tick()
        c.child.returncode = 0; self.assertTrue(c.tick() and c.close_metadata()['exitCode'] == 0)
        self.assertTrue(bytes(self.written) == b'public-pin-list')

    def test_bounded_stdout_stderr_caps(self):
        for fd, size in [(10, M.CAP + 1), (11, 128 * 1024 + 1)]:
            self.blocks = {10: [b''], 11: [b'']}; self.blocks[fd] = [b'x' * size]
            c = M._PipeChild(['fixed'])
            with self.assertRaisesRegex(RuntimeError, 'child-stream-cap'):
                c.tick()
            self.assertTrue(len(c.output[0]) <= M.CAP and len(c.output[1]) <= 128 * 1024)
            self.assertTrue(c.capture_truncated[0 if fd == 10 else 1])
            self.assertTrue(len(M.encode(c.failure_snapshot(drain=False))) <= 600 * 1024)

    def test_registered_child_identity_and_deadline_fail_closed(self):
        c = M._PipeChild(['fixed']); c.child.pid = 99
        with self.assertRaisesRegex(RuntimeError, 'registered-child-identity'):
            c.tick()
        self.blocks = {10: [b'output', b''], 11: [b'']}
        c = M._PipeChild(['fixed']); c.deadline = 0
        with self.assertRaisesRegex(RuntimeError, 'child-deadline'):
            c.tick()

    def test_broken_pipe_preserves_original_error_and_drains_actual_stderr_once(self):
        sentinel = os.urandom(32)
        self.blocks = {10: [b'', b''], 11: [sentinel, b'']}
        c = M._PipeChild(['fixed-root-bootstrap'], b'private-input-not-exported')
        c.child.returncode = 255
        write = unittest.mock.Mock(side_effect=BrokenPipeError(32, 'pipe-closed'))
        with patch.object(M.os, 'write', write):
            with self.assertRaises(BrokenPipeError) as context: c.tick()
            self.assertTrue(context.exception.errno == 32)
            with self.assertRaisesRegex(RuntimeError, 'child-transport-failed'): c.tick()
        snapshot = c.failure_snapshot(drain=False)
        self.assertTrue(write.call_count == 1 and c.child.stdin.closed)
        self.assertTrue(base64.b64decode(snapshot['stderrBase64']) == sentinel and snapshot['localExitCode'] == 255)
        self.assertTrue(snapshot['stdoutNaturalEOF'] and snapshot['stderrNaturalEOF'] and snapshot['remoteExitConfirmed'] is False)
        self.assertTrue(snapshot['inputWrittenBytes'] == 0 and 'inputBase64' not in snapshot)
        with self.assertRaisesRegex(RuntimeError, 'actual-exit-and-two-eof-required'): c.close_metadata()

    def test_transport_capture_never_invents_exit_or_missing_eof(self):
        c = M._PipeChild(['fixed'], b'private-input')
        with (patch.object(M.os, 'read', side_effect=BlockingIOError()),
              patch.object(M.os, 'write', side_effect=BrokenPipeError(32, 'pipe-closed'))):
            with self.assertRaises(BrokenPipeError): c.tick()
        snapshot = c.failure_snapshot(drain=False)
        self.assertTrue(snapshot['localExitCode'] is None and not snapshot['stdoutNaturalEOF']
                        and not snapshot['stderrNaturalEOF'] and not snapshot['remoteExitConfirmed'])

    def test_capture_failure_does_not_mask_original_broken_pipe(self):
        c = M._PipeChild(['fixed'], b'private-input')
        with (patch.object(M.os, 'write', side_effect=BrokenPipeError(32, 'pipe-closed')),
              patch.object(c, 'failure_snapshot', side_effect=OSError(5, 'capture-unavailable'))):
            with self.assertRaises(BrokenPipeError) as context: c.tick()
        self.assertTrue(context.exception.errno == 32 and c.capture_error == {'type': 'OSError', 'errno': 5})

    def test_selector_allocation_failure_happens_before_popen(self):
        with patch.object(M.selectors, 'DefaultSelector', side_effect=OSError('selector-unavailable')):
            with self.assertRaises(OSError): M._PipeChild(['fixed'])
        self.assertTrue(not self.created)

    def test_constructor_post_popen_failure_reaps_real_handle_and_natural_eof(self):
        class Broken(FakeSelector):
            def register(self, *a, **k): raise OSError('capture-failed')
        with patch.object(M.selectors, 'DefaultSelector', Broken):
            with self.assertRaises(OSError) as context: M._PipeChild(['fixed'], deferred=True)
        p = self.created[0]; metadata = context.exception.nativePipeFailure
        self.assertTrue(p.returncode == -15 and p.stdin.closed and p.stdout.closed and p.stderr.closed)
        self.assertTrue(metadata['registeredHostPID'] == 75 and metadata['exitCode'] == -15 and metadata['startupFailed']
                        and metadata['stdoutNaturalEOF'] and metadata['stderrNaturalEOF'] and not metadata['remoteExitConfirmed'])
        private = context.exception.nativePipePrivateCapture
        self.assertTrue(base64.b64decode(private['stdoutBase64']) == b'output'
                        and private['transportFailure']['type'] == 'OSError' and private['localExitCode'] == -15)

    def test_constructor_kill_path_does_not_invent_eof_or_remote_zero(self):
        class Broken(FakeSelector):
            def register(self, *a, **k): raise OSError('capture-failed')
        counter = {'t': 0}
        def now(): counter['t'] += .1; return counter['t']
        original = FakePopen.terminate
        with (patch.object(M.selectors, 'DefaultSelector', Broken), patch.object(FakePopen, 'terminate', lambda *a: None),
              patch.object(M.time, 'monotonic', now), patch.object(M.time, 'sleep', lambda *a: None),
              patch.object(M.os, 'read', side_effect=BlockingIOError())):
            with self.assertRaises(OSError) as context: M._PipeChild(['fixed'], deferred=True)
        metadata = context.exception.nativePipeFailure
        self.assertTrue(metadata['termSent'] and metadata['killSent'] and metadata['exitCode'] == -9
                        and metadata['stdoutNaturalEOF'] is False and metadata['stderrNaturalEOF'] is False
                        and metadata['remoteExitConfirmed'] is False)


class PureInstaller(unittest.TestCase):
    """Execute fixed copy code with synthetic proc/actor facts, never a child."""
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='helmut-installer-pure-'); self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name); self.output = self.root / 'output'; self.output.mkdir()
        self.group = self.root / 'group'; self.group.mkdir(); g = self.group.stat()
        self.request = {'files': [], 'group': {'device': g.st_dev, 'inode': g.st_ino}}
        targets = [('owner', '/opt/local-unit-native-owner.js', b'synthetic-owner', 0o444),
                   ('broker', '/opt/local-unit-diagnostic-broker.js', b'synthetic-broker', 0o444),
                   ('postgrest', '/opt/postgrest-pinned', b'synthetic-rest', 0o555)]
        targets += [('close-source-%02d' % i, '/opt/postgrest-close-source-%02d' % i, ('synthetic-close-%02d' % i).encode(), 0o444) for i in range(8)]
        targets += [('runtime-000', '/lib64/ld-linux-x86-64.so.2', b'synthetic-loader', 0o555),
                   ('runtime-001', '/usr/lib/x86_64-linux-gnu/libc.so.6', b'synthetic-libc', 0o444)]
        self.originals = []
        for index, (name, target, raw, mode) in enumerate(targets):
            source = self.root / ('source-%d' % index); source.write_bytes(raw); source.chmod(0o600); self.originals.append(source)
            self.request['files'].append({'source': {'path': str(source), 'bytes': len(raw), 'sha256': M.sha(raw)},
                'target': '/output/' + name, 'imagePath': target, 'mode': mode})

    def run_fixed(self):
        real_open, real_fd_open, real_stat, real_lstat, real_fstat = builtins.open, M.os.open, M.os.stat, M.os.lstat, M.os.fstat
        def mapped(path):
            text = os.fsdecode(path)
            return str(self.output) + text[len('/output'):] if text == '/output' or text.startswith('/output/') else path
        def actor(info):
            values = {k: getattr(info, k) for k in ('st_dev', 'st_ino', 'st_mode', 'st_uid', 'st_gid', 'st_nlink', 'st_size', 'st_mtime_ns', 'st_ctime_ns')}
            values.update(st_uid=1000, st_gid=1000); return types.SimpleNamespace(**values)
        status = 'Uid: 1000 1000 1000 1000\nGid: 1000 1000 1000 1000\nNoNewPrivs: 1\n' + ''.join(
            name + ': 0\n' for name in ('CapInh', 'CapPrm', 'CapEff', 'CapBnd', 'CapAmb'))
        proc = {'/proc/self/status': status, '/proc/self/cgroup': '0::/\n',
                '/proc/self/stat': '1 (synthetic-python) S ' + ' '.join(['0'] * 18 + ['123'])}
        def opened(path, *args, **kwargs):
            return io.StringIO(proc[str(path)]) if str(path) in proc else real_open(mapped(path), *args, **kwargs)
        captured = io.StringIO(); payload = io.TextIOWrapper(io.BytesIO(M.encode(self.request)), encoding='utf8')
        with (patch.object(builtins, 'open', opened), patch.object(M.os, 'getuid', lambda: 1000),
              patch.object(M.os, 'getgid', lambda: 1000), patch.object(M.os, 'readlink', lambda p: 'pid:[42]'),
              patch.object(M.os, 'stat', lambda p, *a, **k: real_stat(self.group if str(p) == '/owned-group' else mapped(p), *a, **k)),
              patch.object(M.os, 'lstat', lambda p, *a, **k: actor(real_lstat(mapped(p), *a, **k))),
              patch.object(M.os, 'fstat', lambda fd: actor(real_fstat(fd))),
              patch.object(M.os, 'open', lambda p, *a, **k: real_fd_open(mapped(p), *a, **k)),
              patch('sys.stdin', payload), patch('sys.stdout', captured)):
            try:
                exec(compile(M.INSTALLER, '<fixed-installer-synthetic-proc>', 'exec'), {})
            finally:
                self.captured = captured.getvalue()

    def test_fixed_installer_copies_only_explicit_bytes_and_preserves_original_modes(self):
        self.run_fixed()
        records = [M.unique(line) for line in self.captured.splitlines()]
        self.assertTrue(len(records) == 2 and records[1]['schema'] == 'helmut-local-unit-alias-installer-result/1')
        for row in self.request['files']:
            target = self.output / Path(row['target']).name
            self.assertTrue(target.read_bytes() == Path(row['source']['path']).read_bytes()
                            and target.stat().st_mode & 0o777 == row['mode'] and target.stat().st_nlink == 1)
        self.assertTrue(all(p.stat().st_mode & 0o777 == 0o600 for p in self.originals))
        with self.assertRaises(FileExistsError): self.run_fixed()
        self.assertTrue(len(self.captured.splitlines()) == 1)

    def test_fixed_installer_wrong_hash_never_emits_success(self):
        self.request['files'][-1]['source']['sha256'] = '0' * 64
        with self.assertRaises(AssertionError): self.run_fixed()
        self.assertTrue(len(self.captured.splitlines()) == 1)

    def test_fixed_installer_runtime_target_or_mode_cannot_be_freely_chosen(self):
        for bad in ('target', 'mode'):
            row = self.request['files'][-1]
            if bad == 'target': row['target'] = '/output/../../private'
            else: row.update(target='/output/runtime-001', mode=0o777)
            for p in self.output.iterdir(): p.unlink()
            with self.subTest(bad=bad), self.assertRaises(AssertionError): self.run_fixed()
            self.assertTrue(len(self.captured.splitlines()) == 1)


class PureInventoryProjection(unittest.TestCase):
    def setUp(self):
        self.host = M.NativeExecutionHost.__new__(M.NativeExecutionHost)
        self.host.config = {'parent': 'helmut-meter-memorybudget-' + 'c' * 24}
        self.parent = '/' + self.host.config['parent']
        self.rows = [self.row('a', self.parent), self.row('b', self.parent + '-foreign')]
        self.ids = None; self.projection = None; self.details = None; self.calls = []
        self.host._docker = self.docker
        self.addCleanup(patch.stopall)
        patch.object(M.subprocess, 'Popen', side_effect=AssertionError('no process starts')).start()
        patch.object(M.subprocess, 'run', side_effect=AssertionError('no commands')).start()
        patch.object(M, 'docker_daemon_peer', lambda: None).start()

    def row(self, letter, parent):
        return {'Id': letter * 64, 'HostConfig': {'CgroupParent': parent},
                'Mounts': [{'Source': '/synthetic/' + 'x' * 128, 'Destination': '/fixture'}] * 20}

    def docker(self, argv, **options):
        self.calls.append(argv[:])
        if argv[0] == 'ps':
            return types.SimpleNamespace(stdout=self.ids if self.ids is not None else '\n'.join(r['Id'] for r in self.rows))
        if argv[:2] == ['inspect', '--format']:
            self.assertEqual(argv[2], M.GLOBAL_CONTAINER_FORMAT)
            raw = self.projection if self.projection is not None else inventory_fixture_output(argv, self.rows).stdout
            return types.SimpleNamespace(stdout=raw)
        self.assertEqual(argv[0], 'inspect')
        raw = json.dumps(self.details) if self.details is not None else inventory_fixture_output(argv, self.rows).stdout
        return types.SimpleNamespace(stdout=raw)

    def assert_no_detailed_inspect(self):
        self.assertFalse(any(a[0] == 'inspect' and a[1:2] != ['--format'] for a in self.calls))

    def test_global_projection_covers_foreign_ids_but_details_only_exact_owned(self):
        self.rows += [self.row('c', self.parent + '/child')]
        expected = {self.rows[0]['Id'], self.rows[2]['Id']}
        actual = self.host._inventory(expected)
        self.assertEqual(actual, {r['Id']: r for r in self.rows if r['Id'] in expected})
        self.assertEqual(self.calls[0], ['ps', '--all', '--quiet', '--no-trunc'])
        self.assertEqual(self.calls[1], ['inspect', '--format', M.GLOBAL_CONTAINER_FORMAT, *[r['Id'] for r in self.rows]])
        self.assertEqual(self.calls[2], ['inspect', *sorted(expected)])
        projection = inventory_fixture_output(self.calls[1], self.rows).stdout
        self.assertTrue(all(set(json.loads(line)) == {'Id', 'CgroupParent'} for line in projection.splitlines()))
        old_bytes = len(json.dumps(self.rows).encode())
        new_bytes = len(projection.encode()) + len(json.dumps(list(actual.values())).encode())
        self.assertLess(new_bytes, old_bytes)  # Synthetic pipe bytes, no native timing claim.

    def test_unknown_owned_container_is_still_denied_before_details(self):
        self.rows[1]['HostConfig']['CgroupParent'] = self.parent + '/unknown'
        with self.assertRaisesRegex(RuntimeError, 'unknown-or-missing-owned-container'):
            self.host._inventory({self.rows[0]['Id']})
        self.assert_no_detailed_inspect()

    def test_missing_known_container_is_denied_before_details(self):
        with self.assertRaisesRegex(RuntimeError, 'unknown-or-missing-owned-container'):
            self.host._inventory({self.rows[0]['Id'], 'f' * 64})
        self.assert_no_detailed_inspect()

    def test_global_id_duplicates_or_nonhex_never_reach_inspect(self):
        for raw in ('a' * 64 + '\n' + 'a' * 64, 'G' * 64, 'a' * 63):
            with self.subTest(rawLength=len(raw)):
                self.calls.clear(); self.ids = raw
                with self.assertRaisesRegex(RuntimeError, 'global-container-id-set'):
                    self.host._inventory({'a' * 64})
                self.assertEqual(len(self.calls), 1)

    def test_global_projection_requires_exact_complete_unique_typed_rows(self):
        a, b = ({'Id': r['Id'], 'CgroupParent': r['HostConfig']['CgroupParent']} for r in self.rows)
        variants = [
            [a], [a, a], [a, b, {'Id': 'f' * 64, 'CgroupParent': '/foreign'}],
            [a, {**b, 'extra': False}], [a, {**b, 'CgroupParent': None}],
            [a, {**b, 'CgroupParent': 0}], [a, {**b, 'Id': 'bad'}], [a, []],
        ]
        for index, rows in enumerate(variants):
            with self.subTest(variant=index):
                self.calls.clear(); self.projection = '\n'.join(json.dumps(r) for r in rows)
                with self.assertRaises(RuntimeError): self.host._inventory({'a' * 64})
                self.assert_no_detailed_inspect()
        for raw in ('not-json', '{"Id":"a","Id":"b","CgroupParent":""}'):
            self.projection = raw; self.calls.clear()
            with self.assertRaises((RuntimeError, ValueError)): self.host._inventory({'a' * 64})
            self.assert_no_detailed_inspect()

    def test_details_parent_drift_even_inside_same_owned_subtree_is_denied(self):
        self.details = [copy.deepcopy(self.rows[0])]
        self.details[0]['HostConfig']['CgroupParent'] += '/changed'
        with self.assertRaisesRegex(RuntimeError, 'owned-container-detail-binding'):
            self.host._inventory({'a' * 64})

    def test_details_need_same_unique_id_set_and_complete_hostconfig(self):
        variants = [[], [self.rows[0], self.rows[0]], self.rows,
                    [{'Id': 'a' * 64}], [{'Id': 'f' * 64, 'HostConfig': {'CgroupParent': self.parent}}], {}]
        for index, rows in enumerate(variants):
            with self.subTest(variant=index):
                self.details = rows
                with self.assertRaises(RuntimeError): self.host._inventory({'a' * 64})

    def test_every_call_observes_complete_global_mapping_again_without_cache(self):
        self.host._inventory({'a' * 64})
        self.rows[1]['HostConfig']['CgroupParent'] = self.parent
        with self.assertRaisesRegex(RuntimeError, 'unknown-or-missing-owned-container'):
            self.host._inventory({'a' * 64})
        self.assertEqual(sum(a[0] == 'ps' for a in self.calls), 2)
        self.assertEqual(sum(a[:2] == ['inspect', '--format'] for a in self.calls), 2)


class PureInventoryParentCache(unittest.TestCase):
    """New cache cases only; no real daemon/socket/child is contacted."""
    row = PureInventoryProjection.row
    assert_no_detailed_inspect = PureInventoryProjection.assert_no_detailed_inspect

    def setUp(self):
        PureInventoryProjection.setUp(self)
        self.peer = (27, 42, 0o140660, 65534, 65534, 1, 139, 65534, 65534, '617', 'dockerd')
        self.version = {**M.DAEMON_PARENT_VERSION, 'Os': 'linux'}
        self.version_error = None; self.after_details = None
        patch.object(M, 'docker_daemon_peer', lambda: self.peer).start()

    def docker(self, argv, **options):
        if argv[0] == 'version':
            self.calls.append(argv[:]); self.assertEqual(argv, ['version', '--format', M.DAEMON_VERSION_FORMAT])
            if self.version_error is not None: raise self.version_error
            return types.SimpleNamespace(stdout=json.dumps(self.version))
        if argv[:2] == ['inspect', '--format']:
            self.calls.append(argv[:]); self.assertEqual(argv[2], M.GLOBAL_CONTAINER_FORMAT)
            raw = self.projection if self.projection is not None else '\n'.join(json.dumps({
                'Id': r['Id'], 'CgroupParent': r['HostConfig']['CgroupParent']}) for r in self.rows if r['Id'] in argv[3:])
            return types.SimpleNamespace(stdout=raw)
        result = PureInventoryProjection.docker(self, argv, **options)
        if argv[0] == 'inspect' and self.after_details is not None: self.after_details()
        return result

    def projections(self):
        return [a[3:] for a in self.calls if a[:2] == ['inspect', '--format']]

    def test_parent_cache_cold_warm_global_ids_and_own_details_are_always_fresh(self):
        self.host._inventory({'a' * 64})
        self.assertEqual(self.projections(), [['a' * 64, 'b' * 64]])
        self.rows[0]['Mounts'] = [{'Source': '/fresh-own-mount', 'Destination': '/fixture'}]
        actual = self.host._inventory({'a' * 64})
        self.assertEqual(self.projections(), [['a' * 64, 'b' * 64]])
        self.assertEqual(actual['a' * 64]['Mounts'], self.rows[0]['Mounts'])
        self.assertEqual(sum(a[0] == 'ps' for a in self.calls), 2)
        self.assertEqual([a for a in self.calls if a[0] == 'inspect' and a[1:2] != ['--format']],
                         [['inspect', 'a' * 64], ['inspect', 'a' * 64]])
        self.assertEqual(sum(a[0] == 'version' for a in self.calls), 4)

    def test_parent_cache_new_ids_removal_and_recreated_name_use_new_full_cid(self):
        self.rows[1]['Name'] = '/same-foreign-name'
        self.host._inventory({'a' * 64})
        self.rows.append({**self.row('c', '/foreign'), 'Name': '/another'})
        self.host._inventory({'a' * 64}); self.assertEqual(self.projections()[-1], ['c' * 64])
        self.rows = [r for r in self.rows if r['Id'] != 'b' * 64]
        self.host._inventory({'a' * 64}); self.assertNotIn('b' * 64, self.host._inventory_parent_cache)
        self.rows.append({**self.row('d', '/foreign-recreated'), 'Name': '/same-foreign-name'})
        self.host._inventory({'a' * 64}); self.assertEqual(self.projections()[-1], ['d' * 64])
        self.assertEqual(set(self.host._inventory_parent_cache), {'a' * 64, 'c' * 64, 'd' * 64})

    def test_parent_cache_new_unknown_owned_or_missing_known_clears_all_cached_entries(self):
        self.host._inventory({'a' * 64}); self.calls.clear()
        self.rows.append(self.row('c', self.parent + '/unknown'))
        with self.assertRaisesRegex(RuntimeError, 'unknown-or-missing-owned-container'):
            self.host._inventory({'a' * 64})
        self.assertEqual(self.projections(), [['c' * 64]]); self.assert_no_detailed_inspect()
        self.assertEqual(self.host._inventory_parent_cache, {}); self.assertIsNone(self.host._inventory_daemon_cache_key)
        self.rows = self.rows[:2]; self.host._inventory({'a' * 64}); self.calls.clear()
        self.rows = self.rows[1:]
        with self.assertRaisesRegex(RuntimeError, 'unknown-or-missing-owned-container'):
            self.host._inventory({'a' * 64})
        self.assert_no_detailed_inspect(); self.assertEqual(self.host._inventory_parent_cache, {})

    def test_parent_cache_new_projection_must_be_complete_unique_typed_and_exact(self):
        original = copy.deepcopy(self.rows)
        new = {'Id': 'c' * 64, 'CgroupParent': '/foreign'}
        variants = [[], [new, new], [{**new, 'Id': 'bad'}], [{**new, 'CgroupParent': None}],
                    [{**new, 'extra': 1}], [new, {'Id': 'f' * 64, 'CgroupParent': '/foreign'}]]
        for rows in variants:
            with self.subTest(rows=len(rows)):
                self.rows = copy.deepcopy(original); self.projection = None; self.host._inventory({'a' * 64})
                self.rows.append(self.row('c', '/foreign')); self.projection = '\n'.join(json.dumps(r) for r in rows)
                self.calls.clear()
                with self.assertRaises(RuntimeError): self.host._inventory({'a' * 64})
                self.assert_no_detailed_inspect(); self.assertEqual(self.host._inventory_parent_cache, {})

    def test_parent_cache_duplicate_or_malformed_global_ids_never_use_cached_success(self):
        self.host._inventory({'a' * 64})
        for raw in ('a' * 64 + '\n' + 'a' * 64, 'G' * 64, 'a' * 63):
            with self.subTest(length=len(raw)):
                self.ids = raw; self.calls.clear()
                with self.assertRaisesRegex(RuntimeError, 'global-container-id-set'):
                    self.host._inventory({'a' * 64})
                self.assertEqual(self.projections(), []); self.assert_no_detailed_inspect()
                self.assertEqual(self.host._inventory_parent_cache, {})

    def test_parent_cache_own_parent_drift_is_detected_by_fresh_full_details(self):
        self.host._inventory({'a' * 64}); self.calls.clear()
        self.details = [copy.deepcopy(self.rows[0])]; self.details[0]['HostConfig']['CgroupParent'] += '/changed'
        with self.assertRaisesRegex(RuntimeError, 'owned-container-detail-binding'):
            self.host._inventory({'a' * 64})
        self.assertEqual(self.projections(), []); self.assertEqual(self.host._inventory_parent_cache, {})

    def test_parent_cache_daemon_restart_forces_complete_reclassification(self):
        self.host._inventory({'a' * 64}); self.calls.clear()
        self.peer = (*self.peer[:-2], '900', 'dockerd')
        self.rows[1]['HostConfig']['CgroupParent'] = '/different-after-daemon-reload'
        self.host._inventory({'a' * 64})
        self.assertEqual(self.projections(), [['a' * 64, 'b' * 64]])
        self.assertEqual(self.host._inventory_parent_cache['b' * 64], '/different-after-daemon-reload')

    def test_parent_cache_daemon_change_during_inventory_never_publishes_cache_or_rows(self):
        self.host._inventory({'a' * 64})
        self.after_details = lambda: setattr(self, 'peer', (*self.peer[:-2], str(int(self.peer[-2]) + 1), 'dockerd'))
        with self.assertRaisesRegex(RuntimeError, 'inventory-daemon-binding-drift'):
            self.host._inventory({'a' * 64})
        self.assertEqual(self.host._inventory_parent_cache, {}); self.assertIsNone(self.host._inventory_daemon_cache_key)

    def test_parent_cache_unknown_peer_or_version_loses_cache_and_uses_existing_full_scan(self):
        for change in ('peer', 'Version', 'ApiVersion', 'MinAPIVersion', 'GitCommit', 'version-error'):
            with self.subTest(change=change):
                self.peer = (27, 42, 0o140660, 65534, 65534, 1, 139, 65534, 65534, '617', 'dockerd')
                self.version = dict(M.DAEMON_PARENT_VERSION); self.version_error = None
                self.host._inventory({'a' * 64}); self.calls.clear()
                if change == 'peer': self.peer = None
                elif change == 'version-error': self.version_error = PermissionError(13, 'synthetic-version-deny')
                else: self.version[change] = 'unsupported'
                self.host._inventory({'a' * 64}); self.host._inventory({'a' * 64})
                self.assertEqual(self.projections(), [['a' * 64, 'b' * 64], ['a' * 64, 'b' * 64]])
                self.assertEqual(self.host._inventory_parent_cache, {}); self.assertIsNone(self.host._inventory_daemon_cache_key)


class PureDockerDaemonPeer(unittest.TestCase):
    def probe(self, mutation=None):
        calls = []; credentials = M.struct.pack('3i', 0 if mutation == 'pid-zero' else 139, 65534, 65534)
        fields = [b'Z' if mutation == 'zombie' else b'S', *([b'0'] * 18), b'617', *([b'0'] * 6)]
        command = b'proxy' if mutation == 'proxy' else b'dockerd'
        raw = b'139 (' + command + b') ' + b' '.join(fields) + b'\n'
        def entry(inode, mode, uid=65534):
            return types.SimpleNamespace(st_dev=27, st_ino=inode, st_mode=mode, st_uid=uid, st_gid=65534,
                                         st_nlink=1, st_size=0, st_mtime_ns=0, st_ctime_ns=0)
        socket_md = entry(42, 0o100660 if mutation == 'not-socket' else 0o140660)
        def metadata(path, **kwargs):
            calls.append(('stat', path))
            if path == '/var/run/docker.sock':
                if mutation == 'socket-change' and sum(x == ('stat', path) for x in calls) > 1:
                    return entry(43, 0o140660)
                return socket_md
            return entry(91 if path.endswith('/stat') else 92, 0o100444, 1000 if mutation == 'proc-owner' else 65534)
        def opened(path, flags):
            calls.append(('open', path)); self.assertEqual(flags, M.os.O_RDONLY | M.os.O_NOFOLLOW | M.os.O_NONBLOCK)
            if mutation == 'eacces': raise PermissionError(13, 'synthetic-proc-deny')
            self.assertIn(path, ('/proc/139/stat', '/proc/139/comm')); return 91 if path.endswith('/stat') else 92
        class Peer:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def settimeout(self, timeout): calls.append(('timeout', timeout))
            def connect(self, path): calls.append(('connect', path))
            def getsockopt(self, *args):
                calls.append(('credentials', None))
                if mutation == 'credential-change' and sum(k == 'credentials' for k, _ in calls) > 1:
                    return M.struct.pack('3i', 140, 65534, 65534)
                return credentials
        with patch.object(M.socket, 'socket', lambda *args: Peer()), patch.object(M.os, 'stat', metadata), \
             patch.object(M.os, 'open', opened), patch.object(M.os, 'close', lambda fd: calls.append(('close', fd))), \
             patch.object(M.os, 'fstat', lambda fd: entry(fd, 0o100444, 1000 if mutation == 'proc-owner' else 65534)), \
             patch.object(M.os, 'read', lambda fd, size: raw if fd == 91 else command + b'\n'):
            return M.docker_daemon_peer(), calls

    def test_daemon_peer_records_real_shape_metadata_only_and_closes_fds(self):
        value, calls = self.probe()
        self.assertEqual(value, (27, 42, 0o140660, 65534, 65534, 1, 139, 65534, 65534, '617', 'dockerd'))
        self.assertEqual([x for x in calls if x[0] == 'connect'], [('connect', '/var/run/docker.sock')])
        self.assertEqual([x for x in calls if x[0] == 'close'], [('close', 91), ('close', 92)])
        self.assertEqual(sum(k == 'credentials' for k, _ in calls), 2)

    def test_daemon_peer_unknown_proxy_permission_or_identity_change_never_qualifies_cache(self):
        for mutation in ('pid-zero', 'proxy', 'zombie', 'eacces', 'socket-change', 'credential-change', 'proc-owner', 'not-socket'):
            with self.subTest(mutation=mutation):
                value, calls = self.probe(mutation); self.assertIsNone(value)
                self.assertLessEqual(sum(k == 'connect' for k, _ in calls), 1)
        with patch.object(M, 'DOCKER', ['/other/docker', '--host=unix:///other.sock']), \
             patch.object(M.socket, 'socket', side_effect=AssertionError('changed-endpoint-must-not-connect')):
            self.assertIsNone(M.docker_daemon_peer())


class PureObservationSampleWindow(unittest.TestCase):
    pin = PureHost.pin
    request = PureHost.request
    observation = PureHost.observation

    def setUp(self):
        PureHost.setUp(self)
        real_datetime = datetime.datetime
        self.epoch = real_datetime(2026, 10, 23, tzinfo=datetime.timezone.utc)
        self.clock = {'seconds': 4.0}; owner = self
        class ClockDatetime(real_datetime):
            @classmethod
            def now(cls, tz=None):
                value = owner.epoch + datetime.timedelta(seconds=owner.clock['seconds'])
                return value.astimezone(tz) if tz else value.replace(tzinfo=None)
        patch.object(M.datetime, 'datetime', ClockDatetime).start()
        patch.object(M.time, 'time', lambda: (self.epoch + datetime.timedelta(seconds=self.clock['seconds'])).timestamp()).start()
        patch.object(M.time, 'monotonic', lambda: 1000 + self.clock['seconds']).start()
        original_read = M.read_file
        patch.object(M, 'read_file', lambda p, *a, **k: original_read(p, *a, **{**k, 'uid': os.getuid()})).start()
        self.host.state = 'QUALIFIED'; self.host.started_at = 1000

    def iso(self, seconds):
        return (self.epoch + datetime.timedelta(seconds=seconds)).isoformat(timespec='milliseconds').replace('+00:00', 'Z')

    def accept_request(self, issued=3.8):
        request = self.request(); request.update(issuedAtUTC=self.iso(issued), expiresAtUTC=self.iso(issued + 3))
        path = self.case / 'HOST_REQUEST_01.PRIVATE.json'
        request_pin = M.write_once(path, M.encode(request))
        self.host._accept(request, request_pin['sha256'])
        return request, path.read_bytes()

    def sample(self, start, end, observed=None):
        sample = {'startedMonotonic': 1000 + start, 'startedAtUTC': self.iso(start),
                  'completedMonotonic': 1000 + end, 'completedAtUTC': self.iso(end)}
        observation = self.observation({'fixture': 'fresh'}); observation['observedAtUTC'] = self.iso(end if observed is None else observed)
        return observation, sample

    def test_old_sample_keeps_original_pending_then_new_sample_publishes_once(self):
        request, raw = self.accept_request(); pending = self.host.pending
        before = copy.deepcopy(pending); observation, sample = self.sample(0, 3.9)
        self.assertFalse(self.host._reply_observation(observation, sample))
        self.assertIs(self.host.pending, pending); self.assertEqual(self.host.pending, before)
        self.assertEqual(self.host.seq, 1); self.assertEqual(self.host.seen, {request['nonce']})
        self.assertFalse(list(self.case.glob('*HOST_REPLY*')))
        self.clock['seconds'] = 4.5; fresh, fresh_sample = self.sample(4.1, 4.3)
        self.assertTrue(self.host._reply_observation(fresh, fresh_sample))
        reply_path = self.case / 'HOST_REPLY_01.PRIVATE.json'; reply = M.unique(reply_path.read_bytes())
        self.assertEqual(reply['result'], fresh); self.assertEqual(reply['requestSHA256'], M.sha(raw))
        self.assertEqual(reply['nonce'], request['nonce']); self.assertEqual(self.host.observed_at, 1004.3)
        self.assertIsNone(self.host.pending); self.assertEqual(self.host.seq, 2)
        self.assertEqual((self.case / 'HOST_REQUEST_01.PRIVATE.json').read_bytes(), raw)

    def test_sample_observed_before_request_does_not_publish_or_redate(self):
        self.accept_request(); pending = self.host.pending
        observation, sample = self.sample(3.4, 3.7)
        before = copy.deepcopy((observation, sample, pending))
        self.assertFalse(self.host._reply_observation(observation, sample))
        self.assertEqual((observation, sample, self.host.pending), before)
        self.assertIs(self.host.pending, pending); self.assertFalse(list(self.case.glob('*HOST_REPLY*')))

    def test_both_clocks_must_be_fresh_without_refreshing_either(self):
        self.accept_request()
        for stale in ('monotonic', 'utc'):
            observation, sample = self.sample(3.8, 3.9)
            if stale == 'monotonic': sample['startedMonotonic'] = 1000
            else: sample['startedAtUTC'] = self.iso(0)
            with self.subTest(clock=stale):
                self.assertFalse(self.host._reply_observation(observation, sample))
                self.assertIsNotNone(self.host.pending); self.assertFalse(list(self.case.glob('*HOST_REPLY*')))

    def test_expired_original_request_fails_instead_of_extending_pending_window(self):
        request, raw = self.accept_request(); self.clock['seconds'] = 6.8
        observation, sample = self.sample(6.5, 6.7)
        with self.assertRaisesRegex(RuntimeError, 'private-ipc-window'):
            self.host._reply_observation(observation, sample)
        self.assertEqual(self.host.pending['request'], request)
        self.assertEqual((self.case / 'HOST_REQUEST_01.PRIVATE.json').read_bytes(), raw)
        self.assertFalse(list(self.case.glob('*HOST_REPLY*')))

    def test_invalid_clock_order_or_nonfinite_is_terminal_not_deferred(self):
        self.accept_request()
        for field, value in [('startedMonotonic', float('nan')), ('startedMonotonic', True),
                             ('completedMonotonic', 1005), ('startedAtUTC', self.iso(3.95))]:
            observation, sample = self.sample(3.8, 3.9); sample[field] = value
            with self.subTest(field=field), self.assertRaises(RuntimeError):
                self.host._reply_observation(observation, sample)
        self.assertFalse(list(self.case.glob('*HOST_REPLY*')))

    def test_late_stale_tick_waits_for_real_next_tick_without_accept_replay(self):
        self.clock['seconds'] = 0; self.host.last_observation = {'stale': 'never-publish'}
        request = self.request(); request.update(issuedAtUTC=self.iso(3.7), expiresAtUTC=self.iso(6.7))
        def late_observe():
            self.clock['seconds'] = 3.8
            M.write_once(self.case / 'HOST_REQUEST_01.PRIVATE.json', M.encode(request))
            return self.observation({'tick': 1})
        self.host._observe = late_observe
        with patch.object(self.host, '_accept', wraps=self.host._accept) as accept:
            first = self.host.tick(); pending = self.host.pending
            self.assertEqual(first['pending'], 'HOST_OBSERVE'); self.assertIsNone(self.host.failure)
            self.assertFalse((self.case / 'HOST_REPLY_01.PRIVATE.json').exists())
            def next_observe():
                self.assertIs(self.host.pending, pending); self.clock['seconds'] = 4.0
                return self.observation({'tick': 2})
            self.host._observe = next_observe
            second = self.host.tick()
            self.assertEqual(accept.call_count, 1); self.assertIsNone(second['pending'])
        reply = M.unique((self.case / 'HOST_REPLY_01.PRIVATE.json').read_bytes())
        self.assertEqual(reply['result']['source'], {'tick': 2}); self.assertEqual(reply['nonce'], request['nonce'])
        self.assertEqual(self.host.seen, {request['nonce']}); self.assertEqual(self.host.observed_at, 1004.0)

    def test_new_eligibility_never_overwrites_an_existing_reply(self):
        self.accept_request(); path = self.case / 'HOST_REPLY_01.PRIVATE.json'
        original = b'{"synthetic":"already-published"}'; M.write_once(path, original)
        observation, sample = self.sample(3.8, 3.9)
        with self.assertRaises(OSError): self.host._reply_observation(observation, sample)
        self.assertEqual(path.read_bytes(), original); self.assertEqual(self.host.seq, 1)
        self.assertIsNotNone(self.host.pending)


class PureObserverVM(unittest.TestCase):
    def test_fixed_node_observer_with_synthetic_proc_only(self):
        # Only a Node VM executes here. Every filesystem/process view in the
        # observer is synthetic; this cannot call Docker, a DB or an engine.
        program = r'''
const vm=require('node:vm'),crypto=require('node:crypto'),EventEmitter=require('node:events');
const source=JSON.parse(require('node:fs').readFileSync(0,'utf8'));
const flags=['--max-old-space-size=384','--max-semi-space-size=16'];
function run(fault){
 const stdin=new EventEmitter(),output=[],timers=new Set();let nonce='a'.repeat(64);
 const proc={pid:44,version:'v24.19.0',execArgv:[...flags,'-e',source],stdin,exitCode:0,exit:c=>{proc.exitCode=c;throw Error('exit');}};
 const fs={readFileSync(p){
  if(p==='/proc/sys/kernel/random/boot_id')return'11111111-1111-1111-1111-111111111111\n';
  const m=p.match(/^\/proc\/(1|44)\/(stat|status|cgroup)$/);if(!m)throw Error('unexpected-path');
  const id=Number(m[1]);if(fault==='gone'&&id===1){let e=Error('gone');e.code='ENOENT';throw e;}
  if(m[2]==='cgroup')return fault==='foreignCG'?'0::/foreign\n':'0::/\n';
  if(m[2]==='stat'){const f=Array(20).fill('0');f[0]='S';f[19]=id===1?'123':'124';return id+' (node) '+f.join(' ');}
  return ['Uid: '+(fault==='uid'?'0':'1000')+' 1000 1000 1000','Gid: 1000 1000 1000 1000','NSpid: '+id,'NoNewPrivs: '+(fault==='nnp'?'0':'1'),
   ...['CapInh','CapPrm','CapEff','CapBnd','CapAmb'].map(k=>k+': '+(fault==='cap'&&k==='CapEff'?'1':'0'))].join('\n');
 },readlinkSync(p){if(p.endsWith('/exe'))return'/fixed/node';const k=p.split('/').at(-1);
  if(k==='time'){if(fault==='timePermission'){let e=Error('denied');e.code='EACCES';throw e;}if(fault!=='timeExists'){let e=Error('absent');e.code='ENOENT';throw e;}}
  return k+':[42]';},statSync:p=>{if(p!=='/owned-group')throw Error('unexpected-stat');return{dev:1,ino:2};}};
 const box={require:n=>{if(n==='node:fs')return fs;if(n==='node:crypto')return crypto;if(n==='node:v8')return{getHeapStatistics:()=>({heap_size_limit:432*1024**2})};throw Error('unexpected-module');},
  process:proc,console:{log:x=>output.push(JSON.parse(x))},Buffer,setTimeout:f=>{timers.add(f);return f;},clearTimeout:f=>timers.delete(f)};
 vm.runInNewContext(source,box,{timeout:1000});
 if(proc.exitCode===0){const q={schema:'helmut-local-unit-native-process-observer-request/1',nonce,init:{pid:1,startTicks:'123'},targets:[{pid:1,startTicks:'123'}],group:{device:1,inode:2}};
  stdin.emit('data',Buffer.from(JSON.stringify(q)));stdin.emit('end');}
 return{output,code:proc.exitCode,timers:timers.size};
}
for(const fault of ['none','timeExists','gone','uid','cap','nnp','foreignCG','timePermission']){
 const r=run(fault),success=['none','timeExists','gone'].includes(fault);
 if(success){if(r.code!==0||r.output.length!==2||r.timers!==0)throw Error('positive-failed');
  const target=r.output[1].targets[0];
  if(fault==='gone'){if(target.gone!==true)throw Error('gone-unobserved');}
  else if((target.namespaces.time===null)!==(fault==='none'))throw Error('clock-witness');
  if(r.output[1].requestNonceSHA256!==crypto.createHash('sha256').update('a'.repeat(64)).digest('hex'))throw Error('nonce-binding');
 }else if(r.code===0||r.timers!==0)throw Error('negative-accepted');
}
process.stdout.write('observer-vm-cases=8\n');
'''
        node = shutil.which('node'); self.assertIsNotNone(node)
        result = subprocess.run([node, '-e', program], input=json.dumps(M.PROCESS_OBSERVER), text=True,
                                capture_output=True, timeout=10, env=M.ENV)
        self.assertTrue(result.returncode == 0 and result.stdout == 'observer-vm-cases=8\n' and result.stderr == '')


if __name__ == '__main__':
    # Even test failures carry no captured command/stdout/stderr/bootstrap bytes.
    result = unittest.TextTestRunner(stream=io.StringIO()).run(unittest.defaultTestLoader.loadTestsFromModule(__import__(__name__)))
    print('native-execution-host pure: %d checks; failures=%d; errors=%d; nativeStarts=0; database=0; motor=0' %
          (result.testsRun, len(result.failures), len(result.errors)))
    if not result.wasSuccessful():
        print('failedCases=' + ','.join(x[0].id().rsplit('.', 1)[-1] for x in result.failures + result.errors))
        raise SystemExit(1)
