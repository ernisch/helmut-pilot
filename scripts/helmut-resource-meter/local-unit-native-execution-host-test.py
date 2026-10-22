"""Pure host/pipe/DTO cases. No Docker, native child, database or engine starts."""
import copy
import datetime
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
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


class FakeChild:
    def __init__(self, argv=None, data=None, lifetime=None):
        self.argv = argv; self.data = data; self.output = [bytearray(), bytearray()]
        self.child = types.SimpleNamespace(poll=lambda: None)

    def tick(self):
        return False


class PureHost(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='helmut-host-pure-'); self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.nonce = 'a' * 32; self.case = self.base / self.nonce; self.case.mkdir(mode=0o700)
        (self.case / 'client').mkdir(mode=0o700)
        self.addCleanup(patch.stopall); patch.object(M, 'BASE', self.base).start()
        self.config = {'nonce': self.nonce, 'repository': str(self.base / 'repo'), 'runtime': {'imageId': 'sha256:' + 'b' * 64},
                       'parent': 'helmut-meter-memorybudget-' + 'c' * 24, 'parentDevice': 1, 'parentInode': 2,
                       'nodePin': self.pin('/opt/original/bin/node'), 'actualSourceContainerId': 'd' * 64, 'sourceCodePins': [],
                       'executionHost': {'clientRuntimePins': [], 'postgrestPin': self.pin('/opt/original/postgrest')}, 'runtimeBindings': []}
        self.aliases = {k: self.pin('/opt/' + v) for k, v in [('owner', 'local-unit-native-owner.js'),
                     ('broker', 'local-unit-diagnostic-broker.js'), ('postgrest', 'postgrest-pinned')]}
        self.plan = {'nonce': self.nonce, 'volumes': {'ram': 'ram-own', 'run': 'run-own'}, 'aliasPins': self.aliases,
                     'sourceAliasMounts': [(str(self.case / k), v['path'], True) for k, v in self.aliases.items()],
                     'nodeMount': (self.config['nodePin']['path'], self.config['nodePin']['path'], True), 'clientRuntimeMounts': [], 'knownSetupContainerIds': []}
        self.mounts = [*self.plan['sourceAliasMounts'], self.plan['nodeMount']]
        self.native = types.SimpleNamespace(parent_path=lambda _: self.base / 'group')
        self.supervisor = types.SimpleNamespace(PYTHON=Path('/opt/python'))
        self.host = M.NativeExecutionHost(self.native, self.supervisor, self.config, self.case, {'helpers': {}}, 'd' * 64, self.mounts, self.plan)
        self.selection = {'operationId': 'localUnitDiagnostic-' + self.nonce, 'commandHash': 'e' * 64}
        self.host.selection = self.selection

    def pin(self, path, raw=b'public-bytes'):
        return {'path': path, 'bytes': len(raw), 'sha256': M.sha(raw)}

    def request(self, stage='HOST_OBSERVE', body=None, seq=1):
        now = datetime.datetime.now(datetime.timezone.utc)
        return {'schema': 'helmut-local-unit-native-host-request/1', 'seq': seq, 'stage': stage, 'nonce': 'f' * 64,
                'selection': self.selection, 'issuedAtUTC': now.isoformat(timespec='milliseconds').replace('+00:00', 'Z'),
                'expiresAtUTC': (now + datetime.timedelta(seconds=2)).isoformat(timespec='milliseconds').replace('+00:00', 'Z'), 'body': body or {}}

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
        self.host.state = 'QUALIFIED'; r = self.request(); self.host._observe = lambda: {'metadata': 1}
        self.host._accept(r, '1' * 64)
        raw, _ = M.read_file(self.case / 'HOST_REPLY_01.PRIVATE.json', uid=os.getuid()); reply = M.unique(raw)
        self.assertTrue(set(reply) == {'schema', 'seq', 'stage', 'nonce', 'selection', 'requestSHA256', 'issuedAtUTC', 'expiresAtUTC', 'result'})
        self.assertTrue(reply['selection'] == self.selection and reply['nonce'] == r['nonce'] and reply['requestSHA256'] == '1' * 64)
        M.window(reply); self.assertTrue(self.host.seq == 2 and self.host.pending is None)

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

    def test_tick_failure_permanently_seals_no_retry(self):
        self.host._observe = lambda: M.need(False, 'simulated-drift')
        with self.assertRaisesRegex(RuntimeError, '^native-execution-host-sealed-failure$'):
            self.host.tick()
        with self.assertRaisesRegex(RuntimeError, 'sealed-host'):
            self.host.tick()

    def test_root_private_input_is_stdin_never_argv(self):
        with patch.object(M, '_PipeChild', FakeChild):
            child = self.host._root(M.BOOTSTRAP, {'private': 'not-for-argv'})
        self.assertTrue(child.data == M.encode({'private': 'not-for-argv'}))
        self.assertTrue(not any('not-for-argv' in x for x in child.argv))
        self.assertTrue(child.argv[:6] == [*M.DOCKER, 'exec', '-i', '--user', '0:0'])
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
        with patch.object(M.os, 'getuid', lambda: 0):
            with self.assertRaisesRegex(RuntimeError, 'actual-host-uid-gid-1000'):
                M.NativeExecutionHost(self.native, self.supervisor, self.config, self.case, {}, 'd' * 64, self.mounts, self.plan)

    def test_preparation_allocates_only_two_exact_tmpfs_volumes_and_public_aliases(self):
        inputs = self.base / 'public'; inputs.mkdir()
        pins = []
        for name in ('local-unit-native-owner.js', 'local-unit-diagnostic-broker.js', 'postgrest', 'node'):
            p = inputs / name; p.write_bytes(('bounded-public-' + name).encode()); p.chmod(0o600)
            pins.append(self.pin(str(p), p.read_bytes()))
        self.config.update(sourceCodePins=pins[:2], nodePin=pins[3])
        self.config['executionHost']['postgrestPin'] = pins[2]
        group = self.base / 'group'; group.mkdir(); g = group.stat()
        self.config.update(parentDevice=g.st_dev, parentInode=g.st_ino)
        volumes = {}; commands = []
        def docker(argv, **opts):
            commands.append(argv)
            if argv[:2] == ['volume', 'create']:
                options = [argv[i + 1] for i, x in enumerate(argv) if x == '--opt']
                volumes[argv[-1]] = {'Name': argv[-1], 'Driver': 'local', 'Options': dict(x.split('=', 1) for x in options)}
                return types.SimpleNamespace(stdout=argv[-1], returncode=0)
            name = argv[-1]
            return types.SimpleNamespace(returncode=0 if name in volumes else 1, stdout=json.dumps([volumes[name]]) if name in volumes else '')
        installed = []
        def install(native, supervisor, config, alias_dir, public, actual_group):
            installed.append((public, actual_group))
            for key, p, _, mode in public:
                M.write_once(alias_dir / key, Path(p['path']).read_bytes(), mode)
            return {'containerId': '9' * 64, 'exitCode': 0, 'stdoutNaturalEOF': True, 'stderrNaturalEOF': True}
        native = types.SimpleNamespace(docker=docker, parent_path=lambda _: group)
        with patch.object(M, '_install_aliases', install):
            plan = M.prepare_execution(native, types.SimpleNamespace(PYTHON=Path('/opt/python')), self.config, self.case)
        self.assertTrue(len(volumes) == 2 and len(plan['sourceAliasMounts']) == 3 and plan['nodeMount'] == (pins[3]['path'], pins[3]['path'], True))
        self.assertTrue(any('size=268435456,uid=1000,gid=1000,mode=0711' in v['Options']['o'] for v in volumes.values()))
        self.assertTrue(any('size=16777216,uid=0,gid=0,mode=0755' in v['Options']['o'] for v in volumes.values()))
        self.assertTrue(all((inputs / n).stat().st_mode & 0o777 == 0o600 for n in ('local-unit-native-owner.js', 'local-unit-diagnostic-broker.js', 'postgrest', 'node')))
        self.assertTrue((self.case / 'owner-public/owner').stat().st_mode & 0o777 == 0o444
                        and (self.case / 'owner-public/postgrest').stat().st_mode & 0o777 == 0o555)
        self.assertTrue(all(c[:2] in (['volume', 'inspect'], ['volume', 'create']) for c in commands))
        self.assertTrue(len(installed) == 1 and installed[0][1] == group and plan['knownSetupContainerIds'] == ['9' * 64])

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
                if self.name.endswith('/cgroup'): return '0::/' + (parent if fault['key'] != 'parent' else 'foreign') + '/source\n'
                if self.name.endswith('/status'):
                    return '\n'.join(['Uid:\t' + ('0' if fault['key'] == 'uid' else '1000') + '\t1000\t1000\t1000',
                                      'Gid:\t1000\t1000\t1000\t' + ('0' if fault['key'] == 'gid' else '1000'),
                                      'NSpid:\t91\t7', 'NoNewPrivs:\t' + ('0' if fault['key'] == 'nnp' else '1'),
                                      *[k + ':\t' + ('1' if fault['key'] == 'cap' and k == 'CapEff' else '0') for k in ('CapInh','CapPrm','CapEff','CapBnd','CapAmb')]])
                raise AssertionError('closed-proc-path')
        def link(p):
            name = str(p)
            return '/opt/original/bin/node' if name.endswith('/exe') else name.rsplit('/', 1)[-1] + ':[42]'
        with patch.object(M, 'Path', ProcPath), patch.object(M.os, 'readlink', link):
            result = self.host._proc(91, 1000)
            self.assertTrue(result['hostPID'] == 91 and result['namespacePID'] == 7 and result['startTicks'] == '123')
            for key in ('uid', 'gid', 'nnp', 'cap', 'parent'):
                fault['key'] = key
                with self.assertRaises(RuntimeError):
                    self.host._proc(91, 1000)

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
        self.host._docker = lambda argv, **k: types.SimpleNamespace(stdout=('d' * 64 + '\n' + '9' * 64)
            if argv[0] == 'ps' else json.dumps(rows))
        with self.assertRaisesRegex(RuntimeError, 'unknown-or-missing-owned-container'):
            self.host._observe()

    def test_common_parent_directory_identity_cannot_be_rebound(self):
        group = self.base / 'group'; group.mkdir(); self.native.parent_path = lambda _: group
        self.config.update(parentDevice=group.stat().st_dev, parentInode=group.stat().st_ino + 1)
        with self.assertRaisesRegex(RuntimeError, 'actual-parent-directory'):
            self.host._observe()

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

    def test_registered_child_identity_and_deadline_fail_closed(self):
        c = M._PipeChild(['fixed']); c.child.pid = 99
        with self.assertRaisesRegex(RuntimeError, 'registered-child-identity'):
            c.tick()
        c.child.pid = 75; c.deadline = 0
        with self.assertRaisesRegex(RuntimeError, 'child-deadline'):
            c.tick()


if __name__ == '__main__':
    # Even test failures carry no captured command/stdout/stderr/bootstrap bytes.
    result = unittest.TextTestRunner(stream=io.StringIO()).run(unittest.defaultTestLoader.loadTestsFromModule(__import__(__name__)))
    print('native-execution-host pure: %d checks; failures=%d; errors=%d; nativeStarts=0; database=0; motor=0' %
          (result.testsRun, len(result.failures), len(result.errors)))
    if not result.wasSuccessful():
        print('failedCases=' + ','.join(x[0].id().rsplit('.', 1)[-1] for x in result.failures + result.errors))
        raise SystemExit(1)
