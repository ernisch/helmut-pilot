#!/usr/bin/env python3
"""Synthetic coordinator contracts. No real target, helper, process or network."""
from contextlib import ExitStack, redirect_stdout
import copy
import hashlib
import io
import json
import os
from pathlib import Path
import stat
import tempfile
import types
import unittest
from unittest.mock import Mock, patch

PATH = Path(__file__).with_name('hetzner-native-setup-coordinator.py')
with os.fdopen(os.open(PATH, os.O_RDONLY | os.O_NOATIME | os.O_NOFOLLOW), 'rb') as stream:
    SOURCE = stream.read()
m = types.ModuleType('synthetic_setup_coordinator')
exec(compile(SOURCE, str(PATH), 'exec'), m.__dict__)
DEFAULT_MAP = copy.deepcopy(m.ASSET_MAP)
LOAD_ASSETS = m.load_assets
CASE = 'f707b8e21b9f5f0f1d4fc131de38cd615c0c8e6e7f87631574af6bf2b672efa0'


class CoordinatorTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='.coordinator-synthetic-', dir=PATH.parent.parent)
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.base, self.context_dir = self.root / 'control', self.root / 'context'
        self.base.mkdir(mode=0o700); self.context_dir.mkdir(mode=0o700)
        self.real_open, self.real_fstat, self.real_stat = os.open, os.fstat, os.stat
        self.stack = ExitStack(); self.addCleanup(self.stack.close)
        for key, value in (('BASE', str(self.base)), ('CONTEXT', str(self.context_dir))):
            self.stack.enter_context(patch.object(m, key, value))
        self.stack.enter_context(patch.object(m.time, 'monotonic', return_value=1000.0))
        self.overrides, self.public_id = {}, None
        self.before_result = self.after_result = None
        self.guard_output = lambda output: output
        def directory(path):
            relative = Path(path).relative_to(self.root)
            fd = self.real_open(self.root, m.D)
            try:
                for part in relative.parts:
                    child = self.real_open(part, m.D, dir_fd=fd)
                    os.close(fd); fd = child
                return fd
            except BaseException: os.close(fd); raise
        self.stack.enter_context(patch.object(m, 'directory', side_effect=directory))
        def view(info):
            identity = (info.st_dev, info.st_ino)
            owner = 1000 if identity == self.public_id else 0
            keys = ('st_dev', 'st_ino', 'st_mode', 'st_uid', 'st_gid', 'st_nlink', 'st_size',
                    'st_atime_ns', 'st_mtime_ns', 'st_ctime_ns', 'st_rdev', 'st_blocks')
            values = {key: getattr(info, key) for key in keys}
            return types.SimpleNamespace(**{**values, 'st_uid': owner, 'st_gid': owner,
                                           **self.overrides.get(identity, {})})
        self.stack.enter_context(patch.object(m.os, 'fstat', side_effect=lambda fd: view(self.real_fstat(fd))))
        self.stack.enter_context(patch.object(m.os, 'stat', side_effect=lambda *a, **kw: view(self.real_stat(*a, **kw))))
        self.http = self.stack.enter_context(patch.object(m.http.client, 'HTTPSConnection', side_effect=AssertionError('no real network')))
        self.context = {'base': str(self.base), 'source_sha256': '1' * 64, 'deployment_commit': '2' * 40, 'deadline': 1300.0}
        self.request = {'schema': 'helmut-native-control-request-v1', 'operation': 'admit', 'nonce': '3' * 64,
                        'plan_sha256': m.PLAN, 'payload_sha256': self.context['source_sha256']}
        self.assets = {alias: ('# EXPLICITLY_SYNTHETIC_ASSET_' + alias + '\n').encode() for alias in m.FILES}
        self.pins = {alias: {'repoFile': filename, 'sha256': m.sha(self.assets[alias]), 'bytes': len(self.assets[alias])}
                     for alias, filename in m.FILES.items()}
        self.stack.enter_context(patch.object(m, 'ASSET_MAP', self.pins))
        old = self.base / ('stage-' + CASE)
        self.paths = {'historical_binding': str(self.base / 'once' / (m.PLAN + '.stage-case.json')),
            'historical_error': str(self.base / 'STAGE_FIRST_ERROR.SAFE.json'),
            'historical_receipt': str(old / 'restored/RESTORE_RECEIPT.PRIVATE.json'),
            'recovery_once': str(self.base / 'once' / (m.PLAN + '.pax-recovery.json')),
            'recovery_ready': str(self.base / 'RESTORE_PAX_RECOVERY_READY.SAFE.json'),
            'recovery_receipt': str(old / 'restored-pax-recovery/RESTORE_RECEIPT.PRIVATE.json'),
            'public_once': str(self.base / 'PUBLIC_CODE_PR942_ATTEMPT.SAFE.json'),
            'public_ready': str(self.base / 'PUBLIC_CODE_PR942_READY.SAFE.json'),
            'public_repository': str(self.base / 'public-code/pr942-29b05ac0'),
            'context_once': str(self.context_dir / 'NATIVE_CONTEXT_ATTEMPT.SAFE.json'),
            'context_receipt': str(self.context_dir / ('native-context-' + CASE) / 'CONTEXT_RECEIPT.SAFE.json'),
            'image_receipt': str(self.base / 'BUDGET_IMAGE_IMPORT_READY.SAFE.json')}
        for role in m.ROLES[:3]: self.write(self.paths[role], m.encoded({'synthetic': role, 'not_original_data': True}))
        self.driver = {'paths': lambda: self.paths, 'bindings': Mock(side_effect=self.bindings), 'read': self.driver_read}
        self.guard = {'run_setup_phase': Mock(side_effect=self.run_guard), 'result_check': Mock(side_effect=lambda value, phase: value),
                      'unit_name': lambda nonce: 'helmut-native-setup-' + nonce + '.service'}
        self.loader = self.stack.enter_context(patch.object(m, 'load_assets', return_value=(self.assets, {'driver.py': self.driver, 'guard.py': self.guard})))

    def write(self, path, raw):
        path = Path(path); self.assertTrue(path.is_relative_to(self.root))
        path.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
        fd = self.real_open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
        try: self.assertEqual(os.write(fd, raw), len(raw))
        finally: os.close(fd)

    def raw(self, path):
        self.assertTrue(Path(path).is_relative_to(self.root))
        fd = self.real_open(path, m.R)
        try: return os.read(fd, 16385)
        finally: os.close(fd)

    def driver_read(self, path):
        raw = self.raw(path)
        return raw, {'sha256': m.sha(raw), 'metadata': m.metadata(os.stat(path, follow_symlinks=False))}

    def bindings(self, selected):
        return {role: {'sha256': None, 'metadata': m.metadata(os.stat(self.paths[role], follow_symlinks=False))}
                if role == 'public_repository' else self.driver_read(self.paths[role])[1] for role in selected}

    def run_guard(self, request, context, phase, assets, expected, data):
        self.assertEqual(context, {key: self.context[key] for key in ('base', 'source_sha256', 'deadline')})
        self.assertEqual(request, self.request); self.assertEqual(assets, self.assets)
        self.assertEqual(expected, {alias: {'sha256': value['sha256'], 'bytes': value['bytes']} for alias, value in self.pins.items()})
        index = m.PHASES.index(phase)
        self.assertEqual(set(data), {'old_receipt_sha256', 'recovery_ready_sha256', 'public_ready_sha256', 'context_ready_sha256'})
        self.assertEqual(data['old_receipt_sha256'], m.EXPECTED_OLD_RECEIPT)
        for number, key in enumerate(('recovery_ready_sha256', 'public_ready_sha256', 'context_ready_sha256')):
            self.assertEqual(data[key], self.driver_read(self.paths[m.PRIMARY[number]])[1]['sha256'] if number < index else None)
        for role in m.ROLES[:m.COUNTS[index]]:
            path = Path(self.paths[role])
            if role == 'public_repository':
                path.mkdir(parents=True, mode=0o700, exist_ok=True)
                info = self.real_stat(path); self.public_id = (info.st_dev, info.st_ino)
            elif not path.exists(): self.write(path, m.encoded({'synthetic': role, 'native_qualified': False}))
        if self.before_result is not None: self.before_result()
        value = {'status': m.SUCCESS, 'phase': phase,
            'ready_sha256': self.driver_read(self.paths[m.PRIMARY[index]])[1]['sha256'],
            'native_qualified': False, 'native_go_consumed': False, 'bindings': self.bindings(m.ROLES[:m.COUNTS[index]])}
        worker = {'pid': 4242, 'start_ticks': 1234, 'namespace': [10, 11]}
        job = {'schema': 'helmut-setup-service-job-v1', 'request': request,
            'controller_source_sha256': context['source_sha256'], 'plan_sha256': m.PLAN, 'case_id': CASE,
            'phase': phase, 'boot_id': '11111111-1111-1111-1111-111111111111', 'deadline': context['deadline'],
            'runtime_seconds': 295, 'controller': {'pid': 4241, 'start_ticks': 1230, 'namespace': worker['namespace']},
            'phase_data': data, 'assets': expected}
        job_raw = m.encoded(job)
        self.write(self.base / 'setup-jobs' / request['nonce'] / 'JOB.PRIVATE.json', job_raw)
        proof = {'schema': 'helmut-setup-service-lifecycle-v1', 'nonce': request['nonce'], 'phase': phase,
            'controller_source_sha256': context['source_sha256'], 'job_sha256': m.sha(job_raw),
            'boot_id': job['boot_id'], 'unit': self.guard['unit_name'](request['nonce']), 'runtime_seconds': 295,
            'invocation_id': '4' * 32, 'worker': worker, 'sole_worker': {'cgroup': '/system.slice/' + self.guard['unit_name'](request['nonce']),
                'pids': [4242], 'worker': worker}, 'pidfd_exited': True, 'unit_exit_code': 0, 'result_sha256': m.sha(m.encoded(value))}
        output = {**value, 'lifecycle_proof': proof}
        if self.after_result is not None: self.after_result()
        return self.guard_output(output)

    def call(self): return m.coordinate_setup(self.request, self.context)

    def advance(self, count=1):
        outputs = []
        for index in range(count):
            self.request['nonce'] = format(index + 3, '064x')
            output = self.call(); self.assertEqual(output['status'], m.SUCCESS, output)
            outputs.append(output)
        return outputs

    def marker(self, phase): return self.base / m.marker_name(phase)

    def assert_failure(self, code):
        output = self.call()
        self.assertEqual(output['status'], 'FAIL_KEEP_STATE_NO_RETRY', output)
        self.assertEqual(output['code'], code, output)
        self.assertIs(output['native_qualified'], False); self.assertIs(output['native_go_consumed'], False)
        self.assertEqual(set(output), {'schema', 'status', 'phase', 'code', 'ready_sha256', 'accepted_sha256', 'lifecycle_sha256', 'native_qualified', 'native_go_consumed'})
        return output

    def test_exact_four_calls_advance_one_phase_each_and_keep_historical_evidence(self):
        originals = {role: self.driver_read(self.paths[role]) for role in m.ROLES[:3]}
        outputs = self.advance(4)
        self.assertEqual([row['phase'] for row in outputs], list(m.PHASES))
        self.assertEqual(self.guard['run_setup_phase'].call_count, 4)
        for index, phase in enumerate(m.PHASES):
            value = m.parsed(self.raw(self.marker(phase)))
            self.assertEqual(set(value['bindings']), set(m.ROLES[:m.COUNTS[index]]))
            self.assertEqual(outputs[index]['accepted_sha256'], m.sha(self.raw(self.marker(phase))))
            self.assertTrue(all(type(n) is int for row in value['bindings'].values() for n in row['metadata']))
            self.assertTrue(all(len(row['metadata']) == 12 for row in value['bindings'].values()))
        self.assertEqual({role: self.driver_read(self.paths[role]) for role in m.ROLES[:3]}, originals)

    def test_all_complete_is_readonly_and_does_not_rerun_or_copy_any_phase(self):
        self.advance(4); before = self.bindings(m.ROLES)
        self.guard['run_setup_phase'].reset_mock(); self.request['nonce'] = 'e' * 64
        output = self.call()
        self.assertEqual(output['status'], 'SETUP_COMPLETE_NOT_NATIVE_QUALIFIED')
        self.assertEqual((output['phase'], output['code']), ('complete', 'SETUP_COMPLETE'))
        self.guard['run_setup_phase'].assert_not_called()
        self.assertEqual(self.bindings(m.ROLES), before)

    def test_default_asset_map_is_disabled_before_lock_or_job_or_http(self):
        with patch.object(m, 'ASSET_MAP', DEFAULT_MAP): self.assert_failure('ASSETS_UNQUALIFIED')
        self.loader.assert_not_called(); self.http.assert_not_called()
        self.assertFalse((self.base / m.LOCK).exists())

    def test_request_context_and_asset_types_are_closed_including_booleans(self):
        for key, wrong in (('nonce', True), ('operation', 'native'), ('payload_sha256', '0' * 64)):
            original = self.request[key]; self.request[key] = wrong
            self.assert_failure('REQUEST'); self.request[key] = original
        self.request['extra'] = None; self.assert_failure('REQUEST'); self.request.pop('extra')
        for key, wrong in (('deadline', True), ('deployment_commit', 'main'), ('base', '/arbitrary/path')):
            original = self.context[key]; self.context[key] = wrong
            self.assert_failure('CONTEXT'); self.context[key] = original
        self.pins['guard.py']['bytes'] = True; self.assert_failure('ASSETS_UNQUALIFIED')
        self.pins['guard.py']['bytes'] = len(self.assets['guard.py'])
        self.pins['guard.py']['repoFile'] = 'https://untrusted.invalid/code.py'
        self.assert_failure('ASSETS_UNQUALIFIED')
        self.guard['run_setup_phase'].assert_not_called()

    def test_accepted_hole_is_unknown_and_never_adopted(self):
        self.write(self.marker('image'), b'{}\n')
        self.assert_failure('ACCEPTED_ORDER'); self.guard['run_setup_phase'].assert_not_called()

    def test_unaccepted_ready_or_attempt_or_output_is_never_adopted(self):
        for path in (self.paths['recovery_ready'], self.paths['recovery_once']):
            self.write(path, b'{"synthetic":"unaccepted"}\n')
            self.assert_failure('COMPONENT_UNKNOWN'); Path(path).unlink()
        output = Path(self.paths['recovery_receipt']).parent; output.mkdir(mode=0o700)
        self.assert_failure('COMPONENT_UNKNOWN'); self.guard['run_setup_phase'].assert_not_called()

    def test_pending_or_error_beside_accepted_ready_stops_before_next_phase(self):
        self.advance(); self.guard['run_setup_phase'].reset_mock(); self.request['nonce'] = 'd' * 64
        for path in m.component_paths(self.driver)[1][0]:
            self.write(path, b'{"synthetic":"pending-or-error"}\n')
            self.assert_failure('COMPONENT_UNKNOWN'); Path(path).unlink()
        self.guard['run_setup_phase'].assert_not_called()

    def test_marker_partial_and_unaccepted_guard_job_prevent_retries(self):
        partial = Path(str(self.marker('recover')) + '.PENDING')
        self.write(partial, b'{"synthetic":"partial"}\n'); self.assert_failure('ACCEPTED_PARTIAL'); partial.unlink()
        self.write(self.base / 'setup-jobs' / ('f' * 64) / 'JOB.PRIVATE.json', b'{"synthetic":"unconfirmed-job"}\n')
        self.assert_failure('UNACCEPTED_JOB'); self.guard['run_setup_phase'].assert_not_called()

    def test_accepted_current_hash_or_one_nanosecond_metadata_drift_stops_advancement(self):
        self.advance(); self.guard['run_setup_phase'].reset_mock(); self.request['nonce'] = 'd' * 64
        info = self.real_stat(self.paths['historical_binding'])
        self.overrides[(info.st_dev, info.st_ino)] = {'st_mtime_ns': info.st_mtime_ns + 1}
        self.assert_failure('ACCEPTED_BINDINGS_CHANGED'); self.overrides.clear()
        self.write(self.paths['historical_binding'], b'{"synthetic":"changed-fixture"}\n')
        self.assert_failure('ACCEPTED_BINDINGS_CHANGED'); self.guard['run_setup_phase'].assert_not_called()

    def test_source_or_asset_set_drift_is_unknown_without_rebinding(self):
        self.advance(); self.guard['run_setup_phase'].reset_mock(); self.request['nonce'] = 'd' * 64
        self.context['source_sha256'] = 'b' * 64; self.request['payload_sha256'] = 'b' * 64
        self.assert_failure('ACCEPTED_SOURCE')
        self.context['source_sha256'] = '1' * 64; self.request['payload_sha256'] = '1' * 64
        self.pins['guard.py']['sha256'] = 'b' * 64
        self.assert_failure('ACCEPTED_SOURCE'); self.guard['run_setup_phase'].assert_not_called()

    def test_marker_boolean_metadata_or_extra_role_is_rejected(self):
        self.advance(); original = m.parsed(self.raw(self.marker('recover'))); self.request['nonce'] = 'd' * 64
        for change in ('bool', 'role'):
            value = copy.deepcopy(original)
            if change == 'bool': value['bindings']['historical_binding']['metadata'][0] = True
            else: value['bindings']['unexpected'] = value['bindings']['historical_binding']
            self.write(self.marker('recover'), m.encoded(value)); self.assert_failure('BINDINGS')

    def test_lock_loser_writes_no_first_error_and_starts_no_asset_or_service_work(self):
        with patch.object(m.fcntl, 'flock', side_effect=BlockingIOError): self.assert_failure('SETUP_BUSY')
        self.assertFalse((self.base / m.ERROR).exists()); self.loader.assert_not_called()
        self.guard['run_setup_phase'].assert_not_called()

    def test_lock_requires_root0600_single_link_zero_bytes_nofollow(self):
        path = self.base / m.LOCK; held = self.base / 'synthetic-held-lock'
        self.write(path, b'not-zero'); self.assert_failure('LOCK_IDENTITY')
        self.write(path, b''); path.chmod(0o644); self.assert_failure('LOCK_IDENTITY'); path.chmod(0o600)
        os.link(path, held); self.assert_failure('LOCK_IDENTITY'); held.unlink()
        path.rename(held); path.symlink_to(held)
        self.assert_failure('SETUP_COORDINATOR_FAILURE'); path.unlink(); held.rename(path)
        info = self.real_stat(path); self.overrides[(info.st_dev, info.st_ino)] = {'st_uid': 1000}
        self.assert_failure('LOCK_IDENTITY'); self.loader.assert_not_called()
        self.assertFalse((self.base / m.ERROR).exists())

    def test_partial_marker_publication_is_retained_and_no_later_phase_runs(self):
        original = m.publish
        def publish(root, name, value):
            if name == m.marker_name('recover'):
                self.write(self.base / (name + '.PENDING'), b'{"synthetic":"partial-marker"}\n')
                raise OSError('synthetic-publication-failure')
            return original(root, name, value)
        with patch.object(m, 'publish', side_effect=publish): self.assert_failure('SETUP_COORDINATOR_FAILURE')
        self.assertFalse(self.marker('recover').exists()); self.assertTrue((self.base / m.ERROR).exists())
        self.assertTrue(Path(str(self.marker('recover')) + '.PENDING').exists())
        self.request['nonce'] = 'd' * 64; self.assert_failure('SETUP_PREVIOUS_FAILURE')
        self.guard['run_setup_phase'].assert_called_once()

    def test_guard_failure_or_bad_lifecycle_never_creates_accepted(self):
        self.guard_output = lambda output: {'status': 'FAIL_KEEP_STATE_NO_RETRY', 'code': 'SYNTHETIC_GUARD_FAILURE'}
        self.assert_failure('GUARD_RESULT'); self.assertFalse(self.marker('recover').exists())
        self.assertTrue((self.base / m.ERROR).exists())

    def test_guard_safe_failure_code_is_preserved_in_finite_first_error(self):
        self.guard_output = lambda output: {'status': 'FAIL_KEEP_STATE_NO_RETRY', 'phase': output['phase'],
            'code': 'SYNTHETIC_DRIVER_FIRST_ERROR', 'native_qualified': False, 'native_go_consumed': False}
        self.assert_failure('SYNTHETIC_DRIVER_FIRST_ERROR')
        self.assertEqual(m.parsed(self.raw(self.base / m.ERROR))['code'], 'SYNTHETIC_DRIVER_FIRST_ERROR')
        self.assertFalse(self.marker('recover').exists())

    def test_known_driver_binding_and_read_error_codes_are_preserved(self):
        class DriverError(Exception):
            @property
            def code(self): return self.args[0]
        self.driver['SetupError'] = DriverError
        original = self.driver['bindings'].side_effect
        self.driver['bindings'].side_effect = DriverError('SYNTHETIC_DRIVER_BINDINGS')
        self.assert_failure('SYNTHETIC_DRIVER_BINDINGS')
        self.guard['run_setup_phase'].assert_not_called()
        self.assertFalse((self.base / m.ERROR).exists())
        self.driver['bindings'].side_effect = original
        self.driver['read'] = Mock(side_effect=DriverError('SYNTHETIC_DRIVER_READ'))
        self.assert_failure('SYNTHETIC_DRIVER_READ')
        self.assertEqual(m.parsed(self.raw(self.base / m.ERROR))['code'], 'SYNTHETIC_DRIVER_READ')
        self.assertFalse(self.marker('recover').exists())
        class Untrusted(Exception):
            code = 'UNTRUSTED_EXCEPTION_CODE'
        self.assertEqual(m.safe_code(Untrusted('UNTRUSTED_EXCEPTION_TEXT'), {'driver.py': self.driver}), 'SETUP_COORDINATOR_FAILURE')

    def test_known_guard_result_check_stop_code_is_preserved_without_arbitrary_text(self):
        class GuardStop(Exception):
            pass
        self.guard['Stop'] = GuardStop
        self.guard['result_check'].side_effect = GuardStop('SYNTHETIC_GUARD_RESULT_CHECK')
        self.assert_failure('SYNTHETIC_GUARD_RESULT_CHECK')
        self.assertEqual(m.parsed(self.raw(self.base / m.ERROR))['code'], 'SYNTHETIC_GUARD_RESULT_CHECK')
        self.assertFalse(self.marker('recover').exists())
        namespaces = {'guard.py': self.guard}
        self.assertEqual(m.safe_code(GuardStop('/private/synthetic/detail'), namespaces), 'SETUP_COORDINATOR_FAILURE')
        class OtherStop(GuardStop):
            pass
        self.assertEqual(m.safe_code(OtherStop('UNPINNED_SUBCLASS'), namespaces), 'SETUP_COORDINATOR_FAILURE')

    def test_missing_positive_eof_lifecycle_evidence_cannot_be_replaced_by_a_hash(self):
        def bad(output): output['lifecycle_proof']['pidfd_exited'] = False; return output
        self.guard_output = bad
        self.assert_failure('LIFECYCLE_PROOF'); self.assertFalse(self.marker('recover').exists())

    def test_lifecycle_nonce_result_and_phase_data_must_bind_saved_guard_job(self):
        def bad(output):
            job_path = self.base / 'setup-jobs' / self.request['nonce'] / 'JOB.PRIVATE.json'
            job = m.parsed(self.raw(job_path)); job['phase_data']['old_receipt_sha256'] = '0' * 64
            raw = m.encoded(job); self.write(job_path, raw); output['lifecycle_proof']['job_sha256'] = m.sha(raw)
            return output
        self.guard_output = bad
        self.assert_failure('LIFECYCLE_JOB'); self.assertFalse(self.marker('recover').exists())

    def test_previous_bindings_changed_during_phase_cannot_be_accepted(self):
        info = self.real_stat(self.paths['historical_binding'])
        self.before_result = lambda: self.overrides.update({(info.st_dev, info.st_ino): {'st_ctime_ns': info.st_ctime_ns + 1}})
        self.assert_failure('PREVIOUS_BINDINGS_CHANGED'); self.assertFalse(self.marker('recover').exists())

    def test_final_binding_drift_or_component_error_after_guard_is_not_accepted(self):
        self.after_result = lambda: self.write(self.base / 'RESTORE_PAX_RECOVERY_FIRST_ERROR.SAFE.json', b'{"synthetic":"late-error"}\n')
        self.assert_failure('COMPONENT_UNKNOWN'); self.assertFalse(self.marker('recover').exists())

    def test_marker_requires_root0600_nlink1_and_no_symlink(self):
        self.advance(); path = self.marker('recover'); held = path.with_name('synthetic-held-marker')
        path.rename(held); path.symlink_to(held)
        self.request['nonce'] = 'd' * 64
        self.assert_failure('SETUP_COORDINATOR_FAILURE'); path.unlink(); held.rename(path)
        os.link(path, held)
        self.assert_failure('MARKER_IDENTITY'); held.unlink()
        path.chmod(0o644); self.assert_failure('MARKER_IDENTITY'); path.chmod(0o600)
        info = self.real_stat(path); self.overrides[(info.st_dev, info.st_ino)] = {'st_uid': 1000}
        self.assert_failure('MARKER_IDENTITY')

    def test_http_fetch_has_only_fixed_public_url_and_rejects_redirect_size_and_hash(self):
        filename = m.FILES['guard.py']; raw = self.assets['guard.py']; pin = {'sha256': m.sha(raw), 'bytes': len(raw)}
        connection = Mock(); self.http.side_effect = None; self.http.return_value = connection
        for status, body, expected in ((302, raw, 'ASSET_HTTP_STATUS'), (200, raw + b'x', 'ASSET_BYTES'), (200, b'x' * len(raw), 'ASSET_BYTES')):
            connection.getresponse.return_value = Mock(status=status, read=Mock(return_value=body))
            with self.subTest(status=status), self.assertRaisesRegex(m.SetupError, '^' + expected + '$'):
                m.fetch_asset('2' * 40, filename, pin, 1300)
        connection.getresponse.return_value = Mock(status=200, read=Mock(return_value=raw))
        self.assertEqual(m.fetch_asset('2' * 40, filename, pin, 1300), raw)
        connection.request.assert_called_with('GET', '/ernisch/helmut-pilot/' + '2' * 40 + '/scripts/' + filename,
                                              headers={'Accept': 'application/octet-stream'})
        self.http.assert_called_with('raw.githubusercontent.com', timeout=10)
        for commit, name in (('main', filename), ('2' * 40, 'https://untrusted.invalid/code.py')):
            with self.assertRaisesRegex(m.SetupError, '^ASSET_LOCATION$'): m.fetch_asset(commit, name, pin, 1300)

    def test_assets_compile_nonmain_with_exact_source_bytes_and_fixed_file_metadata(self):
        source = b"assert __name__ != '__main__'\nSYNTHETIC_PUBLIC_ASSET = True\n"
        expected = {alias: {'sha256': m.sha(source), 'bytes': len(source)} for alias in m.FILES}
        with patch.object(m, 'fetch_asset', return_value=source) as fetch:
            assets, modules = LOAD_ASSETS(self.context, expected)
        self.assertEqual(fetch.call_count, 7)
        for alias, filename in m.FILES.items():
            self.assertEqual(assets[alias], source)
            self.assertEqual(modules[alias]['__source_bytes__'], source)
            self.assertEqual(modules[alias]['__file__'], filename)
            self.assertTrue(modules[alias]['SYNTHETIC_PUBLIC_ASSET'])
        self.http.assert_not_called()

    def test_default_cli_is_inert_and_native_flags_never_become_true(self):
        with redirect_stdout(io.StringIO()) as output:
            with self.assertRaises(SystemExit) as error:
                exec(compile(SOURCE, '<synthetic-cli>', 'exec'), {'__name__': '__main__'})
        self.assertEqual(error.exception.code, 2)
        self.assertEqual(json.loads(output.getvalue()), {'status': 'NOT_EXECUTED_EXPLICIT_CONTROLLER_REQUIRED'})
        self.guard['run_setup_phase'].assert_not_called(); self.http.assert_not_called()
        self.assertFalse((self.base / 'once' / (m.PLAN + '.json')).exists())


if __name__ == '__main__': unittest.main(verbosity=2)
