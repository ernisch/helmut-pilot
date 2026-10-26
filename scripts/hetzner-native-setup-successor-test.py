"""Explicitly synthetic successor fixtures. Own temp files; every service replaced."""
from contextlib import ExitStack
import copy
import fcntl
import hashlib
import os
from pathlib import Path
import shutil
import stat
import tempfile
import types
import unittest
from unittest.mock import Mock, patch

SOURCE = Path(__file__).with_name('hetzner-native-setup-successor.py')
with os.fdopen(os.open(SOURCE, os.O_RDONLY | os.O_NOFOLLOW | os.O_NOATIME), 'rb') as handle:
    RAW = handle.read()
m = types.ModuleType('synthetic_successor')
m.__source_bytes__ = RAW
exec(compile(RAW, str(SOURCE), 'exec'), m.__dict__)
LIBRARY_PATH = SOURCE.with_name('hetzner-native-setup-coordinator.py')
with os.fdopen(os.open(LIBRARY_PATH, os.O_RDONLY | os.O_NOFOLLOW | os.O_NOATIME), 'rb') as handle:
    LIBRARY_RAW = handle.read()
RUNTIME = m.runtime_snapshot


class SuccessorTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='synthetic-successor-')
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name) / 'control'
        self.base.mkdir(mode=0o700)
        for name in ('results', 'once'): (self.base / name).mkdir(mode=0o700)
        self.write(self.base / 'TARGET_SETUP_LOCK.PRIVATE', b'')
        self.old = self.base / 'SYNTHETIC_OLD_JOB'
        self.write(self.old, b'EXPLICITLY_SYNTHETIC_OLD_FAILURE\n')
        self.old_before = self.old.read_bytes()
        self.stack = ExitStack(); self.addCleanup(self.stack.close)
        self.stack.enter_context(patch.object(m, 'BASE', str(self.base)))
        self.stack.enter_context(patch.object(m, 'STATE_ROOT', str(self.base / m.NAMESPACE)))
        self.stack.enter_context(patch.object(m.time, 'time', return_value=10000.0))
        self.stack.enter_context(patch.object(m.time, 'monotonic', return_value=1000.0))
        for key in ('getuid', 'geteuid', 'getgid', 'getegid'):
            self.stack.enter_context(patch.object(m.os, key, return_value=0))
        real_stat, real_fstat = os.stat, os.fstat
        def view(info):
            return types.SimpleNamespace(**{**{key: getattr(info, key) for key in dir(info) if key.startswith('st_')},
                                           'st_uid': 0, 'st_gid': 0})
        self.stack.enter_context(patch.object(m.os, 'stat', side_effect=lambda *a, **k: view(real_stat(*a, **k))))
        self.stack.enter_context(patch.object(m.os, 'fstat', side_effect=lambda fd: view(real_fstat(fd))))
        self.library = {'__name__': 'synthetic_successor_library', '__source_bytes__': b'SYNTHETIC_LIBRARY\n'}
        exec(compile(LIBRARY_RAW, str(LIBRARY_PATH), 'exec'), self.library)
        self.library['__source_bytes__'] = b'SYNTHETIC_LIBRARY\n'
        self.library['BASE'] = str(self.base)
        self.library['CONTEXT'] = str(self.base / 'synthetic-context')
        def directory(path):
            need_path = Path(path)
            self.assertTrue(need_path == self.base or self.base in need_path.parents, 'outside own fixture')
            return os.open(path, m.R | os.O_DIRECTORY)
        self.library['directory'] = directory
        self.roles = self.library['ROLES']
        self.bindings = {role: {'sha256': None if role == 'public_repository' else m.sha(role.encode()),
                               'metadata': [1] * 12} for role in self.roles}
        self.primaries = {}
        self.paths = {role: str(self.base / ('SYNTHETIC_COMPONENT_' + role)) for role in self.roles}
        driver = {'bindings': lambda selected: {role: copy.deepcopy(self.bindings[role]) for role in selected},
                  'paths': lambda: self.paths, 'read': lambda path: (b'SYNTHETIC', {'sha256': self.primaries[path]})}
        self.run = Mock(side_effect=self.run_phase)
        self.guard = {'run_setup_phase': self.run, 'result_check': self.result_check,
                      'unit_name': lambda nonce: 'helmut-native-setup-' + nonce + '.service'}
        self.modules = {'guard.py': self.guard, 'driver.py': driver, 'recovery.py': {}}
        self.assets = {name: ('# EXPLICITLY_SYNTHETIC_PINNED_ASSET_' + name + '\n').encode()
                       for name in self.library['FILES']}
        self.expected = {name: {'sha256': m.sha(raw), 'bytes': len(raw)} for name, raw in self.assets.items()}
        self.asset_set = 'e' * 64
        self.library['asset_pins'] = lambda: (self.expected, self.asset_set)
        self.loader = self.library['load_assets'] = Mock(return_value=(self.assets, self.modules))
        self.library['component_paths'] = lambda _: (self.paths, ((), (), (), ()), ((), (), (), ()))
        self.lifecycle = self.library['lifecycle_check'] = Mock(wraps=self.library['lifecycle_check'])
        self.jobs = self.library['guard_jobs_check'] = Mock(wraps=self.library['guard_jobs_check'])
        self.history = {'schema': 'SYNTHETIC_HISTORY', 'job': {'SYNTHETIC': True}}
        self.summary = {'schema': 'SYNTHETIC_SAFE_HISTORY', 'sha256': m.sha(self.old_before)}
        def preserved(history, deadline):
            self.assertEqual(history, self.history)
            fd = os.open(self.old, m.R)
            with os.fdopen(fd, 'rb') as stream: actual = stream.read()
            if actual != self.old_before: raise m.Stop('HISTORY_CHANGED')
            return True
        self.history_check = Mock(side_effect=preserved)
        self.unused = Mock(return_value=True)
        self.preflight = {'__source_bytes__': b'SYNTHETIC_PREFLIGHT\n',
            'collect_history': Mock(return_value=self.history), 'history_summary': lambda _: self.summary,
            'verify_history_unchanged': self.history_check, 'require_unused_components': self.unused}
        self.runtime = {'boot_id': '11111111-2222-3333-4444-555555555555',
            'mount_identity': [1, 2, 0, 3, 4, 5, 4, 6], 'namespace_identity': [4, 7],
            'old_unit': {'fields_sha256': 'f' * 64, 'invocation_id': 'd' * 32,
                         'main_pid': 100, 'cgroup': {'state': 'ABSENT', 'identity': None}},
            'old_controller_ended': True}
        self.gzip = {'sha256': 'a' * 64, 'bytes': 123, 'metadata': [1] * 12}
        self.runtime_mock = self.stack.enter_context(patch.object(m, 'runtime_snapshot', return_value=self.runtime))
        self.stack.enter_context(patch.object(m, 'gzip_snapshot', return_value=self.gzip))
        self.context = {'base': str(self.base), 'source_sha256': 'b' * 64,
                        'deployment_commit': 'c' * 40, 'deadline': 1250.0}
        self.contract = {'schema': 'helmut-setup-successor-contract-v1', 'contract_id': m.NAMESPACE,
            'authorization_source': 'operator-setup-request-20261026-working-test-environment',
            'setup_authorized': True, 'base': str(self.base), 'case_id': m.CASE, 'plan_sha256': m.PLAN,
            'scope_sha256': m.SCOPE, 'target_host': '100.96.83.66', 'target_public_ip': '2.28.77.245',
            'server_sha256': self.context['source_sha256'], 'coordinator_sha256': m.sha(RAW),
            'asset_set_sha256': self.asset_set,
            'library': {'repoFile': 'hetzner-native-setup-coordinator.py', 'sha256': m.sha(self.library['__source_bytes__']),
                        'bytes': len(self.library['__source_bytes__'])},
            'preflight': {'repoFile': 'hetzner-native-setup-successor-preflight.py',
                          'sha256': m.sha(self.preflight['__source_bytes__']), 'bytes': len(self.preflight['__source_bytes__'])},
            'not_before_utc': 9900, 'not_after_utc': 11000, 'allowed_phases': list(m.PHASES),
            'native_qualified': False, 'native_go_consumed': False}
        self.contract_raw = m.encoded(self.contract)
        self.counter = 0

    def write(self, path, raw, mode=0o600):
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, mode)
        with os.fdopen(fd, 'wb') as stream: stream.write(raw)

    def capsule(self, action='inspect', phase=None):
        self.counter += 1
        return {'schema': 'helmut-setup-successor-capsule-v1', 'contract_id': m.NAMESPACE,
            'action': action, 'phase': phase, 'source_sha256': self.context['source_sha256'],
            'contract_sha256': m.sha(self.contract_raw), 'nonce': format(self.counter, '064x'),
            'inspection_nonce': None if action == 'inspect' else self.inspection_nonce,
            'inspection_result_sha256': None if action == 'inspect' else self.inspection_sha,
            'issued_at_utc': 9990, 'expires_at_utc': 10290}

    def request(self, capsule):
        return {'schema': 'helmut-native-control-request-v1', 'operation': 'status' if capsule['action'] == 'inspect' else 'admit',
            'nonce': m.sha(m.PREFIX + m.encoded(capsule)), 'plan_sha256': m.PLAN,
            'payload_sha256': self.context['source_sha256']}

    def coordinate(self, capsule=None, request=None):
        capsule = self.capsule() if capsule is None else capsule
        request = self.request(capsule) if request is None else request
        return m.coordinate_successor(request, self.context, capsule, self.contract_raw, self.library, self.preflight)

    def inspect(self):
        capsule = self.capsule(); request = self.request(capsule)
        result = self.coordinate(capsule, request)
        self.assertEqual(result['status'], 'INSPECTED_NOT_ADMITTED', result)
        self.inspection_nonce, self.inspection_sha = request['nonce'], m.sha(m.encoded(result)[:-1])
        outer = {'schema': 'helmut-native-control-response-v1', 'operation': 'status', 'nonce': request['nonce'],
            'plan_sha256': m.PLAN, 'payload_sha256': self.context['source_sha256'],
            'result': result, 'result_sha256': self.inspection_sha}
        self.write(self.base / 'results' / (request['nonce'] + '.json'), m.encoded(outer))
        return result

    def result_check(self, value, phase):
        self.assertEqual(value['phase'], phase)
        self.assertEqual(value['status'], 'SETUP_PHASE_COMPLETE_NOT_NATIVE_QUALIFIED')
        self.assertIs(value['native_qualified'], False)
        self.assertIs(value['native_go_consumed'], False)

    def run_phase(self, request, context, phase, assets, expected, data):
        self.assertEqual(context, {key: self.context[key] for key in ('base', 'source_sha256', 'deadline')}
                         | {'job_namespace': m.NAMESPACE})
        digest = m.sha(('SYNTHETIC_READY_' + phase).encode())
        self.primaries[self.paths[self.library['PRIMARY'][m.PHASES.index(phase)]]] = digest
        value = {'status': 'SETUP_PHASE_COMPLETE_NOT_NATIVE_QUALIFIED', 'phase': phase,
            'ready_sha256': digest, 'native_qualified': False, 'native_go_consumed': False,
            'bindings': {key: copy.deepcopy(self.bindings[key]) for key in self.roles[:self.library['COUNTS'][m.PHASES.index(phase)]]}}
        nonce = request['nonce']
        jobs = self.base / m.NAMESPACE / 'jobs'; jobs.mkdir(mode=0o700, exist_ok=True)
        job_root = jobs / nonce; job_root.mkdir(mode=0o700)
        worker = {'pid': 6789 + m.PHASES.index(phase), 'start_ticks': 123, 'namespace': [5, 6]}
        job = {'schema': 'helmut-setup-service-job-successor-v1', 'job_namespace': m.NAMESPACE,
            'request': copy.deepcopy(request), 'controller_source_sha256': context['source_sha256'],
            'plan_sha256': m.PLAN, 'case_id': m.CASE, 'phase': phase,
            'boot_id': '11111111-2222-3333-4444-555555555555', 'deadline': context['deadline'],
            'runtime_seconds': 245, 'controller': {'pid': 5678, 'start_ticks': 100, 'namespace': [5, 6]},
            'phase_data': copy.deepcopy(data), 'assets': copy.deepcopy(expected)}
        job_raw, result_raw = m.encoded(job), m.encoded(value)
        unit = self.guard['unit_name'](nonce)
        proof = {'schema': 'helmut-setup-service-lifecycle-v1', 'nonce': nonce, 'phase': phase,
            'controller_source_sha256': context['source_sha256'], 'job_sha256': m.sha(job_raw),
            'boot_id': job['boot_id'], 'unit': unit, 'runtime_seconds': job['runtime_seconds'],
            'invocation_id': 'f'*32, 'worker': worker,
            'sole_worker': {'cgroup': '/system.slice/' + unit, 'pids': [worker['pid']], 'worker': worker},
            'pidfd_exited': True, 'unit_exit_code': 0, 'result_sha256': m.sha(result_raw)}
        arm = {'schema': 'helmut-setup-service-arm-v1', 'nonce': nonce,
            'job_sha256': proof['job_sha256'], 'controller_source_sha256': context['source_sha256'], 'worker': worker}
        ack = {'schema': 'helmut-setup-service-ack-v1', 'nonce': nonce,
            'job_sha256': proof['job_sha256'], 'result_sha256': proof['result_sha256'], 'worker': worker}
        for name, raw in assets.items(): self.write(job_root / name, raw, 0o500)
        for name, raw in (('JOB.PRIVATE.json', job_raw), ('ARM.PRIVATE.json', m.encoded(arm)),
                          ('ACK.PRIVATE.json', m.encoded(ack)), ('RESULT.PRIVATE.json', result_raw)):
            self.write(job_root / name, raw)
        return {**value, 'lifecycle_proof': proof}

    def assert_closed(self, result):
        self.assertEqual(result['status'], 'FAIL_KEEP_STATE_NO_RETRY', result)
        self.assertIs(result['native_qualified'], False)
        self.assertIs(result['native_go_consumed'], False)
        self.run.assert_not_called()

    def test_inspection_does_not_create_authority_once_state_or_component(self):
        before = set(self.base.iterdir())
        result = self.coordinate()
        self.assertEqual(result['status'], 'INSPECTED_NOT_ADMITTED')
        self.assertEqual(set(result), m.INSPECTION_KEYS)
        self.assertEqual(set(self.base.iterdir()), before)
        self.run.assert_not_called(); self.unused.assert_called_once()

    def test_four_separate_phases_preserve_history_and_fixed_authority(self):
        self.inspect()
        authority = None
        for index, phase in enumerate(m.PHASES):
            result = self.coordinate(self.capsule('setup', phase))
            self.assertEqual(result['status'], 'SETUP_PHASE_COMPLETE_NOT_NATIVE_QUALIFIED', result)
            self.assertEqual(result['phase'], phase)
            self.assertEqual(self.run.call_count, index + 1)
            current = (self.base / m.AUTHORITY).read_bytes()
            if authority is None: authority = current
            self.assertEqual(current, authority)
            self.assertEqual(result['authority_sha256'], m.sha(authority))
        self.assertEqual(self.old.read_bytes(), self.old_before)
        self.assertGreaterEqual(self.lifecycle.call_count, 4)
        self.assertTrue(all(call.kwargs == {'job_namespace': m.NAMESPACE} for call in self.lifecycle.call_args_list))

    def test_manifest_missing_extra_wrong_scope_time_pin_and_boolean_fail_before_loader(self):
        original = copy.deepcopy(self.contract)
        changes = ({'setup_authorized': 1}, {'native_qualified': 0}, {'native_go_consumed': True},
            {'target_host': '127.0.0.1'}, {'target_public_ip': '2.28.77.246'}, {'base': '/tmp/foreign'},
            {'case_id': '0'*64}, {'plan_sha256': '0'*64}, {'scope_sha256': '0'*64},
            {'server_sha256': '0'*64}, {'coordinator_sha256': '0'*64}, {'asset_set_sha256': '0'*64},
            {'allowed_phases': list(reversed(m.PHASES))}, {'not_before_utc': 10001},
            {'not_after_utc': 9999}, {'not_after_utc': 999999}, {'not_before_utc': True},
            {'library': {**original['library'], 'repoFile': '../foreign.py'}},
            {'preflight': {**original['preflight'], 'bytes': 1}}, {'extra': None})
        variants = [{**original, **change} for change in changes]
        variants.extend({key: value for key, value in original.items() if key != absent} for absent in original)
        for variant in variants:
            with self.subTest(variant=variant):
                self.contract_raw = m.encoded(variant)
                self.assert_closed(self.coordinate())
        self.loader.assert_not_called()

    def test_capsule_and_outer_nonce_are_not_authority(self):
        valid = self.capsule()
        for change in ({'extra': True}, {'schema': 'old'}, {'contract_id': 'other'}, {'action': 'status'},
            {'phase': 'recover'}, {'source_sha256': '0'*64}, {'contract_sha256': '0'*64},
            {'nonce': 'bad'}, {'issued_at_utc': 10001}, {'expires_at_utc': 9999},
            {'issued_at_utc': True}, {'expires_at_utc': 10301}, {'inspection_nonce': 'f'*64}):
            with self.subTest(change=change): self.assert_closed(self.coordinate({**valid, **change}))
        self.assert_closed(self.coordinate(valid, {**self.request(valid), 'nonce': '0'*64}))
        self.loader.assert_not_called()

    def test_missing_inspection_or_foreign_response_stops_before_authority(self):
        self.inspection_nonce, self.inspection_sha = '1'*64, '2'*64
        self.assert_closed(self.coordinate(self.capsule('setup', 'recover')))
        self.assertFalse((self.base / m.AUTHORITY).exists())

    def test_root_inspection_hash_metadata_and_request_binding_are_checked(self):
        self.inspect()
        path = self.base / 'results' / (self.inspection_nonce + '.json')
        raw = path.read_bytes()
        original = m.parsed(raw)
        for change in ({'nonce': '0'*64}, {'operation': 'admit'}, {'plan_sha256': '0'*64},
            {'payload_sha256': '0'*64}, {'result_sha256': '0'*64}, {'extra': None}):
            with self.subTest(change=change):
                path.write_bytes(m.encoded({**original, **change}))
                self.assert_closed(self.coordinate(self.capsule('setup', 'recover')))
        path.write_bytes(raw); path.chmod(0o640)
        self.assert_closed(self.coordinate(self.capsule('setup', 'recover')))

    def test_inspection_stale_runtime_or_gzip_drift_denies_first_phase(self):
        self.inspect()
        capsule = self.capsule('setup', 'recover')
        with patch.object(m.time, 'time', return_value=10301), patch.dict(capsule, issued_at_utc=10300, expires_at_utc=10600):
            result = self.coordinate(capsule)
            self.assert_closed(result); self.assertEqual(result['code'], 'SUCCESSOR_INSPECTION_STALE')
        with patch.object(m, 'runtime_snapshot', return_value={**self.runtime, 'boot_id': 'foreign'}):
            self.assert_closed(self.coordinate(capsule))
        with patch.object(m, 'gzip_snapshot', return_value={**self.gzip, 'sha256': 'f'*64}):
            self.assert_closed(self.coordinate(capsule))

    def test_inspect_cannot_mint_another_authority_after_setup(self):
        self.inspect(); self.coordinate(self.capsule('setup', 'recover'))
        self.run.reset_mock()
        self.assert_closed(self.coordinate())

    def test_replay_wrong_phase_and_nonce_changes_do_not_rearm(self):
        self.inspect(); first = self.capsule('setup', 'recover')
        self.assertEqual(self.coordinate(first)['status'], 'SETUP_PHASE_COMPLETE_NOT_NATIVE_QUALIFIED')
        self.run.reset_mock()
        for phase in ('recover', 'context', 'image'):
            self.assert_closed(self.coordinate(self.capsule('setup', phase)))
        self.assert_closed(self.coordinate(first))

    def test_missing_or_corrupt_authority_and_once_never_recreate(self):
        self.inspect(); self.coordinate(self.capsule('setup', 'recover'))
        self.run.reset_mock()
        authority = self.base / m.AUTHORITY
        raw = authority.read_bytes(); authority.unlink()
        self.assert_closed(self.coordinate(self.capsule('setup', 'checkout')))
        self.write(authority, raw)
        once = self.base / 'once' / m.ONCE
        once.write_bytes(b'{}\n')
        self.assert_closed(self.coordinate(self.capsule('setup', 'checkout')))

    def test_unknown_attempt_or_additional_state_entry_prevents_followup(self):
        self.inspect(); self.coordinate(self.capsule('setup', 'recover'))
        self.run.reset_mock()
        root = self.base / m.NAMESPACE
        extra = root / 'FOREIGN'
        self.write(extra, b'x')
        self.assert_closed(self.coordinate(self.capsule('setup', 'checkout')))
        extra.unlink()
        fd = self.library['directory'](str(root))
        try: self.library['publish'](fd, 'ATTEMPT_CHECKOUT.PRIVATE.json', {'partial': True})
        finally: os.close(fd)
        self.assert_closed(self.coordinate(self.capsule('setup', 'checkout')))

    def test_shared_lock_busy_stops_without_effect(self):
        fd = os.open(self.base / self.library['LOCK'], m.R)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            result = self.coordinate()
            self.assert_closed(result); self.assertEqual(result['code'], 'SUCCESSOR_BUSY')
        finally: os.close(fd)

    def test_guard_failure_consumes_attempt_and_preserves_first_error(self):
        self.inspect()
        self.run.side_effect = lambda *args: {'status': 'FAIL_KEEP_STATE_NO_RETRY', 'code': 'SYNTHETIC_GUARD_FAIL'}
        result = self.coordinate(self.capsule('setup', 'recover'))
        self.assertEqual(result['code'], 'SYNTHETIC_GUARD_FAIL')
        path = self.base / m.NAMESPACE / m.ERROR
        first = path.read_bytes()
        self.run.reset_mock()
        self.assert_closed(self.coordinate(self.capsule('setup', 'recover')))
        self.assertEqual(path.read_bytes(), first)
        self.assertEqual(self.old.read_bytes(), self.old_before)

    def test_authority_partial_write_remains_spent_without_guard(self):
        self.inspect()
        publish = self.library['publish']
        def partial(root, name, value):
            if name == m.AUTHORITY:
                fd = os.open(name + '.PENDING', os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600, dir_fd=root)
                os.write(fd, b'{'); os.close(fd)
                raise OSError('SYNTHETIC_PARTIAL')
            return publish(root, name, value)
        self.library['publish'] = partial
        self.assert_closed(self.coordinate(self.capsule('setup', 'recover')))
        self.library['publish'] = publish
        self.assert_closed(self.coordinate(self.capsule('setup', 'recover')))
        self.assertTrue((self.base / (m.AUTHORITY + '.PENDING')).exists())

    def test_history_change_during_guard_never_produces_acceptance(self):
        self.inspect()
        def change(*args):
            self.old.write_bytes(b'SYNTHETIC_EXTERNAL_DRIFT')
            return self.run_phase(*args)
        self.run.side_effect = change
        result = self.coordinate(self.capsule('setup', 'recover'))
        self.assertEqual(result['status'], 'FAIL_KEEP_STATE_NO_RETRY')
        self.assertEqual(result['code'], 'SUCCESSOR_HISTORY_CHANGED')
        self.assertFalse((self.base / m.NAMESPACE / self.library['marker_name']('recover')).exists())

    def test_runtime_unknown_and_existing_components_stop_inspection(self):
        self.runtime_mock.side_effect = m.Stop('SUCCESSOR_OLD_CONTROLLER_ALIVE')
        self.assert_closed(self.coordinate())
        self.runtime_mock.side_effect = None
        self.unused.side_effect = m.Stop('SETUP_COMPONENT_PRESENT_OR_UNKNOWN')
        self.assert_closed(self.coordinate())

    def test_controller_absent_replaced_running_and_zombie_kernel_proofs(self):
        job = {'controller': {'pid': 2345, 'start_ticks': 123}}
        def proc(state, start): return ('2345 (SYNTHETIC) ' + ' '.join([state] + ['0']*18 + [str(start)])).encode()
        kernel = Mock(side_effect=FileNotFoundError())
        guard = {'kernel_read': kernel, 'exited': Mock(return_value=True)}
        m.require_controller_ended(job, guard)
        kernel.side_effect = None; kernel.return_value = proc('S', 124)
        m.require_controller_ended(job, guard)
        kernel.return_value = proc('S', 123)
        with self.assertRaisesRegex(m.Stop, 'SUCCESSOR_OLD_CONTROLLER_ALIVE'): m.require_controller_ended(job, guard)
        kernel.return_value = proc('Z', 123)
        fd = os.open(self.old, m.R)
        with patch.object(m.os, 'pidfd_open', return_value=fd): m.require_controller_ended(job, guard)
        guard['exited'].return_value = False
        fd = os.open(self.old, m.R)
        with patch.object(m.os, 'pidfd_open', return_value=fd), self.assertRaises(m.Stop): m.require_controller_ended(job, guard)

    def test_cgroup_mount_requires_existing_fixed_parents_and_cgroup2(self):
        cg = self.base / 'synthetic-cgroup'; cg.mkdir(mode=0o700)
        system = cg / 'system.slice'; system.mkdir(mode=0o700)
        def directory(path):
            self.assertIn(path, ('/sys/fs/cgroup', '/sys/fs/cgroup/system.slice'))
            return os.open(cg if path == '/sys/fs/cgroup' else system, m.R | os.O_DIRECTORY)
        fd = os.open(cg, m.R | os.O_DIRECTORY)
        try: device = os.fstat(fd).st_dev
        finally: os.close(fd)
        major, minor = os.major(device), os.minor(device)
        kernel = Mock(return_value=f'42 12 {major}:{minor} / /sys/fs/cgroup rw - cgroup2 cgroup rw\n'.encode())
        guard = {'directory': directory, 'kernel_read': kernel}
        with patch.object(m.os, 'stat', return_value=types.SimpleNamespace(st_dev=5, st_ino=6)):
            mount, namespace = m.mount_identity(guard)
            self.assertEqual(namespace, [5, 6]); self.assertEqual(mount[:4], [42, 12, major, minor])
            for raw in (b'', b'bad', b'42 12 0:99 / /sys/fs/cgroup rw - tmpfs tmpfs rw\n',
                        b'42 12 0:99 /slice /sys/fs/cgroup rw - cgroup2 cgroup rw\n'):
                kernel.return_value = raw
                with self.assertRaises(m.Stop): m.mount_identity(guard)

    def test_gzip_requires_exact_size_digest_and_metadata(self):
        # Use the function from the unmodified inert source namespace, not the integration mock.
        namespace = {'__name__': 'synthetic_gzip_helper'}
        exec(compile(RAW, str(SOURCE), 'exec'), namespace)
        metadata = [1]*12; metadata[6] = 123
        reader = Mock(return_value=(None, 'a'*64, tuple(metadata)))
        recovery = {'read': reader, 'INPUT': 'SYNTHETIC_FIXED_GZIP', 'GZIP_SIZE': 123, 'GZIP_SHA': 'a'*64}
        self.assertEqual(namespace['gzip_snapshot'](recovery, 1250)['bytes'], 123)
        for answer in ((b'', 'a'*64, metadata), (None, 'b'*64, metadata), (None, 'a'*64, [1]*12)):
            reader.return_value = answer
            with self.assertRaises(namespace['Stop']): namespace['gzip_snapshot'](recovery, 1250)

    def test_safe_error_never_exposes_private_exception_text(self):
        self.runtime_mock.side_effect = OSError('PRIVATE /opt/secret value')
        result = self.coordinate()
        self.assert_closed(result)
        self.assertNotIn('PRIVATE', str(result)); self.assertNotIn('/opt/secret', str(result))

    def test_exact_commit_cannot_change_mid_authority(self):
        self.inspect(); self.coordinate(self.capsule('setup', 'recover'))
        self.run.reset_mock()
        self.context['deployment_commit'] = 'd'*40
        self.assert_closed(self.coordinate(self.capsule('setup', 'checkout')))

    def test_contract_must_cover_whole_monotonic_execution_bound(self):
        self.contract['not_after_utc'] = 10010
        self.contract_raw = m.encoded(self.contract)
        self.assert_closed(self.coordinate())
        self.loader.assert_not_called()

    def test_authority_metadata_drift_during_effect_is_not_accepted(self):
        self.inspect()
        def mutate(*args):
            (self.base / m.AUTHORITY).chmod(0o640)
            return self.run_phase(*args)
        self.run.side_effect = mutate
        result = self.coordinate(self.capsule('setup', 'recover'))
        self.assertEqual(result['status'], 'FAIL_KEEP_STATE_NO_RETRY')
        self.assertFalse((self.base / m.NAMESPACE / self.library['marker_name']('recover')).exists())

    def test_previous_accepted_metadata_drift_during_next_effect_stops(self):
        self.inspect(); self.coordinate(self.capsule('setup', 'recover'))
        marker = self.base / m.NAMESPACE / self.library['marker_name']('recover')
        def mutate(*args):
            marker.touch()
            return self.run_phase(*args)
        self.run.side_effect = mutate
        result = self.coordinate(self.capsule('setup', 'checkout'))
        self.assertEqual(result['status'], 'FAIL_KEEP_STATE_NO_RETRY')
        self.assertFalse((self.base / m.NAMESPACE / self.library['marker_name']('checkout')).exists())

    def test_old_cgroup_absence_empty_and_nonempty_are_distinct(self):
        parent = self.base / 'SYNTHETIC_CGROUP_PARENT'; parent.mkdir(mode=0o700)
        name = 'helmut-native-setup-' + '1'*64 + '.service'
        guard = {'directory': lambda path: os.open(parent, m.R | os.O_DIRECTORY),
                 'cgroup_pids': Mock(return_value=[])}
        result = m.old_cgroup_empty(name, guard, self.library['metadata'])
        self.assertEqual(result, {'state': 'ABSENT', 'identity': None})
        guard['cgroup_pids'].assert_not_called()
        (parent / name).mkdir(mode=0o700)
        result = m.old_cgroup_empty(name, guard, self.library['metadata'])
        self.assertEqual(result['state'], 'EMPTY'); self.assertEqual(guard['cgroup_pids'].call_count, 2)
        guard['cgroup_pids'].return_value = [99]
        with self.assertRaisesRegex(m.Stop, 'SUCCESSOR_OLD_CGROUP_ACTIVE'):
            m.old_cgroup_empty(name, guard, self.library['metadata'])
        (parent / name).rmdir(); (parent / name).symlink_to(self.old)
        with self.assertRaisesRegex(m.Stop, 'SUCCESSOR_CGROUP_IDENTITY'):
            m.old_cgroup_empty(name, guard, self.library['metadata'])

    def test_old_unit_requires_failed_exit_binding_typed_hooks_and_stable_snapshot(self):
        nonce = '1'*64; name = 'helmut-native-setup-' + nonce + '.service'
        job = {'boot_id': '11111111-2222-3333-4444-555555555555',
            'controller': {'pid': 2345, 'start_ticks': 123, 'namespace': [5, 6]},
            'request': {'nonce': nonce}, 'runtime_seconds': 200}
        fields = {'Id': name, 'Transient': 'yes', 'Type': 'exec', 'MainPID': '0', 'ControlPID': '0',
            'ControlGroup': '', 'KillMode': 'control-group', 'Restart': 'no', 'RemainAfterExit': 'yes',
            'User': 'root', 'Group': 'root', 'UMask': '0077', 'StandardOutput': 'null', 'StandardError': 'null',
            'Delegate': 'no', 'SendSIGKILL': 'yes', 'KillSignal': '15', 'FinalKillSignal': '9',
            'TimeoutStopFailureMode': 'kill', 'ExecMainCode': '1', 'ExecMainStatus': '1', 'Result': 'exit-code',
            'ActiveState': 'failed', 'SubState': 'failed', 'RuntimeMaxUSec': '200s', 'TimeoutStopUSec': '5s',
            'InvocationID': 'a'*32, 'ExecMainPID': '4567', 'ExecMainStartTimestampMonotonic': '100',
            'ExecMainExitTimestampMonotonic': '200',
            'ExecStart': '{ path=/usr/bin/env ; argv[]=/usr/bin/env SYNTHETIC ; ignore_errors=no ; pid=4567 ; }'}
        reader = Mock(return_value=fields)
        guard = {'boot_id': lambda: job['boot_id'], 'unit_name': lambda _: name,
            'unit_fields': reader, 'unit_hooks': Mock(), 'worker_argv': lambda _: ['/usr/bin/env', 'SYNTHETIC'],
            'duration': lambda value: float(value[:-1])}
        with patch.object(m, 'mount_identity', return_value=([1, 2], [5, 6])), \
             patch.object(m, 'require_controller_ended') as ended, \
             patch.object(m, 'old_cgroup_empty', return_value={'state': 'ABSENT', 'identity': None}):
            proof = RUNTIME({'job': job}, guard, self.library, 1250)
            self.assertIs(proof['old_controller_ended'], True)
            self.assertEqual(ended.call_count, 2); guard['unit_hooks'].assert_called_once_with(name, 1250)
            for change in ({'MainPID': '4567'}, {'ControlPID': '999'}, {'Result': 'success'},
                {'ActiveState': 'active'}, {'SubState': 'running'}, {'KillMode': 'process'},
                {'ExecMainStatus': '0'}, {'ControlGroup': '/foreign'}, {'ExecStart': 'foreign'},
                {'RuntimeMaxUSec': '201s'}, {'ExecMainExitTimestampMonotonic': '99'}, {'InvocationID': ''}):
                reader.return_value = {**fields, **change}
                with self.subTest(change=change), self.assertRaises(m.Stop): RUNTIME({'job': job}, guard, self.library, 1250)
            reader.return_value = fields; reader.side_effect = [fields, {**fields, 'InvocationID': 'b'*32}]
            with self.assertRaisesRegex(m.Stop, 'SUCCESSOR_OLD_UNIT_CHANGED'): RUNTIME({'job': job}, guard, self.library, 1250)
            reader.side_effect = None; guard['unit_hooks'].side_effect = m.Stop('UNIT_EXTRA_COMMAND')
            with self.assertRaisesRegex(m.Stop, 'UNIT_EXTRA_COMMAND'): RUNTIME({'job': job}, guard, self.library, 1250)

    def rejected_job_followup(self, mutate):
        self.inspect()
        capsule = self.capsule('setup', 'recover')
        first = self.coordinate(capsule)
        self.assertEqual(first['status'], 'SETUP_PHASE_COMPLETE_NOT_NATIVE_QUALIFIED', first)
        job = self.base / m.NAMESPACE / 'jobs' / self.request(capsule)['nonce']
        self.assertEqual(len(list(job.iterdir())), 11)
        mutate(job)
        self.run.reset_mock()
        self.assert_closed(self.coordinate(self.capsule('setup', 'checkout')))
        self.assertFalse((self.base / m.NAMESPACE / 'ATTEMPT_CHECKOUT.PRIVATE.json').exists())
        self.assertEqual(self.old.read_bytes(), self.old_before)

    def test_f2_missing_whole_accepted_job_blocks_checkout(self):
        self.rejected_job_followup(lambda job: shutil.rmtree(job))

    def test_f2_missing_jobs_root_blocks_checkout(self):
        self.rejected_job_followup(lambda job: shutil.rmtree(job.parent))

    def test_f2_invalid_stored_job_json_blocks_checkout(self):
        self.rejected_job_followup(lambda job: (job / 'JOB.PRIVATE.json').write_bytes(b'{'))

    def test_f2_error_in_accepted_job_blocks_checkout(self):
        self.rejected_job_followup(lambda job: self.write(job / 'FIRST_ERROR.PRIVATE.json', b'{}\n'))

    def test_f2_missing_seal_blocks_checkout(self):
        self.rejected_job_followup(lambda job: (job.parent.parent / m.seal_name('recover')).unlink())

    def test_f2_corrupt_seal_blocks_checkout(self):
        self.rejected_job_followup(lambda job: (job.parent.parent / m.seal_name('recover')).write_bytes(b'{}\n'))

    def test_f2_orphan_seal_blocks_checkout(self):
        self.rejected_job_followup(lambda job: self.write(job.parent.parent / m.seal_name('checkout'), b'{}\n'))

    def test_f2_seal_partial_blocks_checkout(self):
        self.rejected_job_followup(lambda job: self.write(job.parent.parent / (m.seal_name('recover') + '.PENDING'), b'{'))

    def test_finished_job_deadline_is_not_reused_as_live_authority(self):
        self.inspect()
        self.assertEqual(self.coordinate(self.capsule('setup', 'recover'))['status'],
                         'SETUP_PHASE_COMPLETE_NOT_NATIVE_QUALIFIED')
        self.context['deadline'] = 2250.0
        with patch.object(m.time, 'monotonic', return_value=2000.0):
            result = self.coordinate(self.capsule('setup', 'checkout'))
        self.assertEqual(result['status'], 'SETUP_PHASE_COMPLETE_NOT_NATIVE_QUALIFIED', result)
        self.assertEqual(self.run.call_count, 2)

    def test_seal_publication_before_accepted_never_allows_retry(self):
        self.inspect()
        publish = self.library['publish']
        def broken(root, name, value):
            if name == self.library['marker_name']('recover'):
                raise OSError('SYNTHETIC_ACCEPTED_PUBLICATION_FAILURE')
            return publish(root, name, value)
        self.library['publish'] = broken
        result = self.coordinate(self.capsule('setup', 'recover'))
        self.assertEqual(result['status'], 'FAIL_KEEP_STATE_NO_RETRY')
        state = self.base / m.NAMESPACE
        self.assertTrue((state / m.seal_name('recover')).exists())
        self.assertFalse((state / self.library['marker_name']('recover')).exists())
        self.run.reset_mock(); self.library['publish'] = publish
        self.assert_closed(self.coordinate(self.capsule('setup', 'recover')))

    def test_sealed_lifecycle_hash_cannot_be_replaced_with_caller_snapshot(self):
        def mutate(job):
            path = job.parent.parent / m.seal_name('recover')
            seal = m.parsed(path.read_bytes())
            seal['lifecycle_proof']['worker']['pid'] += 1
            seal['lifecycle_sha256'] = m.sha(m.encoded(seal['lifecycle_proof']))
            path.write_bytes(m.encoded(seal))
        self.rejected_job_followup(mutate)

    def test_previous_seal_metadata_drift_during_current_effect_blocks_acceptance(self):
        self.inspect(); self.coordinate(self.capsule('setup', 'recover'))
        def mutate(*args):
            result = self.run_phase(*args)
            (self.base / m.NAMESPACE / m.seal_name('recover')).touch()
            return result
        self.run.side_effect = mutate
        result = self.coordinate(self.capsule('setup', 'checkout'))
        self.assertEqual(result['status'], 'FAIL_KEEP_STATE_NO_RETRY')
        self.assertFalse((self.base / m.NAMESPACE / self.library['marker_name']('checkout')).exists())

    def test_prior_job_directory_metadata_drift_during_effect_blocks_acceptance(self):
        self.inspect(); first = self.capsule('setup', 'recover'); self.coordinate(first)
        def mutate(*args):
            result = self.run_phase(*args)
            (self.base / m.NAMESPACE / 'jobs' / self.request(first)['nonce']).touch()
            return result
        self.run.side_effect = mutate
        result = self.coordinate(self.capsule('setup', 'checkout'))
        self.assertEqual(result['status'], 'FAIL_KEEP_STATE_NO_RETRY')
        self.assertFalse((self.base / m.NAMESPACE / self.library['marker_name']('checkout')).exists())

    def test_prior_job_directory_requires_private_mode(self):
        self.rejected_job_followup(lambda job: job.chmod(0o755))

    def test_prior_job_untrusted_owner_blocks_checkout(self):
        def mutate(job):
            target = os.stat(job / 'JOB.PRIVATE.json').st_ino
            original = m.os.fstat
            def owner(fd):
                info = original(fd)
                values = {key: getattr(info, key) for key in dir(info) if key.startswith('st_')}
                if info.st_ino == target: values['st_uid'] = 1000
                return types.SimpleNamespace(**values)
            self.stack.enter_context(patch.object(m.os, 'fstat', side_effect=owner))
        self.rejected_job_followup(mutate)

    def test_current_arm_nonce_must_be_derived_from_actual_job(self):
        self.inspect()
        def mutate(*args):
            result = self.run_phase(*args)
            path = self.base / m.NAMESPACE / 'jobs' / args[0]['nonce'] / 'ARM.PRIVATE.json'
            arm = m.parsed(path.read_bytes()); arm['nonce'] = '0'*64
            path.write_bytes(m.encoded(arm))
            return result
        self.run.side_effect = mutate
        result = self.coordinate(self.capsule('setup', 'recover'))
        self.assertEqual(result['status'], 'FAIL_KEEP_STATE_NO_RETRY')
        self.assertEqual(result['code'], 'SUCCESSOR_JOB_HANDSHAKE')
        self.assertFalse((self.base / m.NAMESPACE / self.library['marker_name']('recover')).exists())

    def test_current_lifecycle_proof_is_checked_by_real_library(self):
        self.inspect()
        def mutate(*args):
            result = self.run_phase(*args)
            result['lifecycle_proof']['pidfd_exited'] = False
            return result
        self.run.side_effect = mutate
        result = self.coordinate(self.capsule('setup', 'recover'))
        self.assertEqual(result['status'], 'FAIL_KEEP_STATE_NO_RETRY')
        self.assertEqual(result['code'], 'LIFECYCLE_PROOF')
        self.assertFalse((self.base / m.NAMESPACE / self.library['marker_name']('recover')).exists())

    def test_guard_job_bytes_are_rechecked_after_seal_publication(self):
        self.inspect()
        publish = self.library['publish']
        def mutate(root, name, value):
            digest = publish(root, name, value)
            if name == m.seal_name('recover'):
                path = self.base / m.NAMESPACE / 'jobs' / value['nonce'] / 'ACK.PRIVATE.json'
                path.write_bytes(b'{}\n')
            return digest
        self.library['publish'] = mutate
        result = self.coordinate(self.capsule('setup', 'recover'))
        self.assertEqual(result['status'], 'FAIL_KEEP_STATE_NO_RETRY')
        self.assertFalse((self.base / m.NAMESPACE / self.library['marker_name']('recover')).exists())

    def test_seal_partial_write_is_durable_unknown_without_retry(self):
        self.inspect()
        publish = self.library['publish']
        def partial(root, name, value):
            if name == m.seal_name('recover'):
                fd = os.open(name + '.PENDING', os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600, dir_fd=root)
                os.write(fd, b'{'); os.close(fd)
                raise OSError('SYNTHETIC_PARTIAL_SEAL')
            return publish(root, name, value)
        self.library['publish'] = partial
        self.assertEqual(self.coordinate(self.capsule('setup', 'recover'))['status'], 'FAIL_KEEP_STATE_NO_RETRY')
        self.assertTrue((self.base / m.NAMESPACE / (m.seal_name('recover') + '.PENDING')).exists())
        self.run.reset_mock(); self.library['publish'] = publish
        self.assert_closed(self.coordinate(self.capsule('setup', 'recover')))

    def test_job_sibling_added_after_attempt_publication_blocks_effect(self):
        self.inspect(); self.coordinate(self.capsule('setup', 'recover'))
        self.run.reset_mock()
        publish = self.library['publish']
        def extra(root, name, value):
            digest = publish(root, name, value)
            if name == 'ATTEMPT_CHECKOUT.PRIVATE.json':
                (self.base / m.NAMESPACE / 'jobs' / ('0'*64)).mkdir(mode=0o700)
            return digest
        self.library['publish'] = extra
        self.assert_closed(self.coordinate(self.capsule('setup', 'checkout')))


def physical_artifact_test(name, mutation):
    def test(self):
        def mutate(job):
            path = job / name
            if mutation == 'missing': path.unlink()
            elif mutation == 'bytes':
                path.chmod(0o700); path.write_bytes(b'EXPLICITLY_SYNTHETIC_DRIFT')
                path.chmod(0o500 if name.endswith('.py') else 0o600)
            elif mutation == 'metadata': path.touch()
            elif mutation == 'mode': path.chmod(0o640)
            elif mutation == 'symlink': path.unlink(); path.symlink_to(self.old)
            elif mutation == 'hardlink': os.link(path, self.base / 'SYNTHETIC_HARDLINK')
            else: raise AssertionError('unknown synthetic mutation')
        self.rejected_job_followup(mutate)
    return test


for artifact in ('JOB.PRIVATE.json', 'ARM.PRIVATE.json', 'ACK.PRIVATE.json', 'RESULT.PRIVATE.json',
                 'guard.py', 'driver.py', 'recovery.py', 'restore.py', 'public.py', 'context.py', 'image.py'):
    for mutation in ('missing', 'bytes', 'metadata', 'mode', 'symlink', 'hardlink'):
        setattr(SuccessorTests, 'test_physical_' + artifact.replace('.', '_') + '_' + mutation,
                physical_artifact_test(artifact, mutation))


def extra_artifact_test(name):
    def test(self):
        self.rejected_job_followup(lambda job: self.write(job / name, b'EXPLICITLY_SYNTHETIC_EXTRA'))
    return test


for extra in ('RESULT.PENDING.PRIVATE.json', '.setup-write-' + '1'*32 + '.tmp', 'FOREIGN'):
    setattr(SuccessorTests, 'test_physical_extra_' + extra.replace('.', '_'), extra_artifact_test(extra))


def current_missing_artifact_test(name):
    def test(self):
        self.inspect()
        def missing(*args):
            result = self.run_phase(*args)
            (self.base / m.NAMESPACE / 'jobs' / args[0]['nonce'] / name).unlink()
            return result
        self.run.side_effect = missing
        result = self.coordinate(self.capsule('setup', 'recover'))
        self.assertEqual(result['status'], 'FAIL_KEEP_STATE_NO_RETRY')
        self.assertFalse((self.base / m.NAMESPACE / self.library['marker_name']('recover')).exists())
        self.run.reset_mock()
        self.assert_closed(self.coordinate(self.capsule('setup', 'recover')))
    return test


for artifact in ('JOB.PRIVATE.json', 'ARM.PRIVATE.json', 'ACK.PRIVATE.json', 'RESULT.PRIVATE.json',
                 'guard.py', 'driver.py', 'recovery.py', 'restore.py', 'public.py', 'context.py', 'image.py'):
    setattr(SuccessorTests, 'test_current_missing_' + artifact.replace('.', '_'), current_missing_artifact_test(artifact))


if __name__ == '__main__': unittest.main()
