"""Own-temp, mocked-service qualification. No live proc/systemd/target access."""
import contextlib
import hashlib
import io
import os
from pathlib import Path
import stat
import tempfile
import time
import types
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).with_name('hetzner-native-context-continuation-service.py')
fd = os.open(SOURCE, os.O_RDONLY | os.O_NOFOLLOW | os.O_NOATIME)
with os.fdopen(fd, 'rb') as handle:
    RAW = handle.read()
M = types.ModuleType('setup_guard_synthetic')
exec(compile(RAW, str(SOURCE), 'exec'), M.__dict__)


class GuardTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='.setup-guard-', dir=SOURCE.parent.parent)
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.stack = contextlib.ExitStack()
        self.addCleanup(self.stack.close)
        self.stack.enter_context(patch.object(M, 'BASE', str(self.base)))
        def own_directory(path):
            self.assertTrue(path == str(self.base) or path.startswith(str(self.base) + '/'))
            return os.open(path, M.D)
        self.stack.enter_context(patch.object(M, 'directory', side_effect=own_directory))
        self.stack.enter_context(patch.object(M, 'admin'))
        self.stack.enter_context(patch.object(M, 'bounded'))
        self.stack.enter_context(patch.object(M, 'boot_id', return_value='11111111-2222-3333-4444-555555555555'))
        self.stack.enter_context(patch.object(M, 'process', side_effect=lambda pid: self.facts(pid)))
        self.stack.enter_context(patch.object(M, 'command', side_effect=AssertionError('no service calls')))
        self.stack.enter_context(patch.object(M, 'kernel_read', side_effect=AssertionError('no proc reads')))
        self.overrides = {}
        real_stat, real_fstat = os.stat, os.fstat
        def view(info):
            values = {name: getattr(info, name) for name in dir(info) if name.startswith('st_')}
            values.update(st_uid=0, st_gid=0)
            values.update(self.overrides.get((info.st_dev, info.st_ino), {}))
            return types.SimpleNamespace(**values)
        self.stack.enter_context(patch.object(M.os, 'stat', side_effect=lambda *a, **k: view(real_stat(*a, **k))))
        self.stack.enter_context(patch.object(M.os, 'fstat', side_effect=lambda fd: view(real_fstat(fd))))
        self.nonce, self.controller_sha = 'a' * 64, 'b' * 64
        self.request = {'schema': 'helmut-native-control-request-v1', 'operation': 'admit',
            'nonce': self.nonce, 'plan_sha256': M.PLAN, 'payload_sha256': self.controller_sha}
        self.context = {'base': str(self.base), 'source_sha256': self.controller_sha,
                        'deadline': time.monotonic() + 240}
        self.data = dict.fromkeys(M.DATA_KEYS)
        self.data['old_receipt_sha256'] = 'c' * 64
        self.data['recovery_ready_sha256'] = '1' * 64
        self.data['public_ready_sha256'] = '2' * 64
        (self.base / M.NAMESPACE).mkdir(mode=0o700)
        self.assets = {name: b'SYNTHETIC = True\n' for name in M.ASSETS}
        self.pins = self.pin(self.assets)
        self.result = {'status': M.SUCCESS, 'phase': 'context', 'ready_sha256': 'd' * 64,
            'native_qualified': False, 'native_go_consumed': False,
            'bindings': {'historical_receipt': {'sha256': 'e' * 64, 'metadata': [1] * 12}}}
        self.baseline = {'worker': self.facts(4242), 'invocation_id': 'f' * 32,
            'unit_start_us': 100000, 'cgroup': '/system.slice/' + M.unit_name(self.nonce)}

    def facts(self, pid):
        return {'pid': pid, 'start_ticks': 12345, 'namespace': [5, 6]}

    def pin(self, assets):
        return {name: {'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw)} for name, raw in assets.items()}

    def job(self):
        return M.create_job(self.request, self.context, 'context', self.assets, self.pins, self.data)

    def run_guard(self):
        return M.run_setup_phase(self.request, self.context, 'context', self.assets, self.pins, self.data)

    def source_view(self, path):
        value = os.stat(path, follow_symlinks=False)
        return (value.st_dev, value.st_ino)



    def job_evidence(self, path):
        root = M.private_dir(str(path))
        try:
            rows = {}
            for name in sorted(os.listdir(root)):
                info = os.stat(name, dir_fd=root, follow_symlinks=False)
                rows[name] = (M.regular(root, name, M.ASSET_CAP, stat.S_IMODE(info.st_mode)), M.metadata(info))
            return M.metadata(os.fstat(root)), rows
        finally: os.close(root)



    def service(self, orphan=False, mutate=False, bad_exit=False, early_exit=False, namespace=M.NAMESPACE):
        """Pump the exact parent ARM/PENDING/ACK/exit handshake using own files."""
        job_path = Path(M.job_directory(self.nonce, namespace))
        real_absent, real_exited = M.absent, []
        def absent(root, name):
            if name == 'RESULT.PENDING.PRIVATE.json' and not real_exited:
                if real_absent(root, name): M.write_new(root, name, M.encoded(self.result))
            return real_absent(root, name)
        def exited(pidfd):
            if early_exit: return True
            root = M.private_dir(str(job_path))
            try:
                if not M.absent(root, 'ACK.PRIVATE.json') and not real_exited:
                    M.rename_result(root)
                    if mutate:
                        fd = os.open('RESULT.PRIVATE.json', os.O_WRONLY | os.O_APPEND, dir_fd=root)
                        os.write(fd, b' '); os.close(fd)
                    real_exited.append(True)
                return bool(real_exited)
            finally: os.close(root)
        def snapshot(job, finished=False):
            if bad_exit: raise M.Stop('UNIT_EXIT')
            return {'InvocationID': self.baseline['invocation_id'], 'ExecMainPID': '4242',
                    'ExecMainStartTimestampMonotonic': '100000'}
        self.stack.enter_context(patch.object(M, 'start_service'))
        self.stack.enter_context(patch.object(M, 'worker_identity', return_value=self.baseline))
        self.stack.enter_context(patch.object(M.os, 'pidfd_open', side_effect=lambda *a: os.open(self.base, M.D)))
        self.stack.enter_context(patch.object(M, 'exited', side_effect=exited))
        self.stack.enter_context(patch.object(M, 'absent', side_effect=absent))
        self.stack.enter_context(patch.object(M, 'cgroup_pids', return_value=[4242, 4243] if orphan else [4242]))
        self.stack.enter_context(patch.object(M, 'unit_snapshot', side_effect=snapshot))
        return self.stack.enter_context(patch.object(M, 'stop_owned'))

    def worker_fixture(self, arm=True, ack=True, bad_arm=False, bad_ack=False):
        root, job, raw = self.job()
        baseline = {**self.baseline, 'worker': self.facts(os.getpid())}
        if arm:
            value = {'schema': 'helmut-context-daemon-binding-v2-service-arm-v1', 'nonce': self.nonce, 'job_sha256': M.sha(raw),
                     'controller_source_sha256': self.controller_sha, 'worker': baseline['worker']}
            if bad_arm: value['job_sha256'] = '0' * 64
            M.write_new(root, 'ARM.PRIVATE.json', M.encoded(value))
        real_absent = M.absent
        def absent(fd, name):
            if ack and name == 'ACK.PRIVATE.json' and not real_absent(fd, 'RESULT.PENDING.PRIVATE.json'):
                if real_absent(fd, name):
                    value = {'schema': 'helmut-context-daemon-binding-v2-service-ack-v1', 'nonce': self.nonce,
                        'job_sha256': M.sha(raw), 'result_sha256': M.sha(M.regular(fd, 'RESULT.PENDING.PRIVATE.json')),
                        'worker': baseline['worker']}
                    if bad_ack: value['result_sha256'] = '0' * 64
                    M.write_new(fd, name, M.encoded(value))
            return real_absent(fd, name)
        self.stack.enter_context(patch.object(M, 'worker_identity', return_value=baseline))
        self.stack.enter_context(patch.object(M.os, 'pidfd_open', side_effect=lambda *a: os.open(self.base, M.D)))
        self.stack.enter_context(patch.object(M, 'worker_watch'))
        self.stack.enter_context(patch.object(M, 'absent', side_effect=absent))
        self.stack.enter_context(patch.object(M, 'cgroup_pids', return_value=[os.getpid()]))
        child = self.stack.enter_context(patch.object(M, 'phase_child', return_value=self.result))
        stop = self.stack.enter_context(patch.object(M, 'stop_owned'))
        return root, job, raw, child, stop

    def test_parent_positive_handshake_returns_bound_lifecycle_and_never_accepts_itself(self):
        stop = self.service()
        result = self.run_guard()
        self.assertEqual(result['status'], M.SUCCESS, result)
        proof = result['lifecycle_proof']
        self.assertTrue(proof['pidfd_exited']); self.assertEqual(proof['unit_exit_code'], 0)
        self.assertEqual(proof['sole_worker']['pids'], [4242])
        self.assertEqual(proof['result_sha256'], M.sha(M.encoded(self.result)))
        self.assertFalse(result['native_qualified']); self.assertFalse(result['native_go_consumed'])
        self.assertFalse(any('ACCEPTED' in p.name for p in self.base.rglob('*')))
        stop.assert_not_called()

    def test_pending_with_an_extra_cgroup_pid_cannot_receive_ack(self):
        stop = self.service(orphan=True)
        self.assertEqual(self.run_guard()['code'], 'CGROUP_NOT_SOLE_WORKER')
        path = self.base / M.NAMESPACE / 'jobs' / self.nonce
        self.assertTrue((path / 'RESULT.PENDING.PRIVATE.json').exists())
        self.assertFalse((path / 'ACK.PRIVATE.json').exists()); stop.assert_called_once()

    def test_eof_is_required_and_exit_or_result_mismatch_cannot_accept(self):
        for mode in ('early_exit', 'bad_exit', 'mutate'):
            with self.subTest(mode=mode):
                self.request['nonce'] = self.nonce = M.sha(mode.encode())
                self.baseline['cgroup'] = '/system.slice/' + M.unit_name(self.nonce)
                with contextlib.ExitStack() as stack:
                    old_stack, self.stack = self.stack, stack
                    try:
                        self.service(**{mode: True})
                        value = self.run_guard()
                        self.assertEqual(value['status'], 'FAIL_KEEP_STATE_NO_RETRY', value)
                        self.assertNotIn('lifecycle_proof', value)
                    finally: self.stack = old_stack

    def test_replay_preserves_existing_job_without_starting_a_service(self):
        root, job, raw = self.job(); os.close(root)
        with patch.object(M, 'start_service') as start:
            result = self.run_guard()
        self.assertEqual(result['status'], 'FAIL_KEEP_STATE_NO_RETRY')
        start.assert_not_called()
        fd = M.private_dir(str(self.base / M.NAMESPACE / 'jobs' / self.nonce))
        try: self.assertEqual(M.regular(fd, 'JOB.PRIVATE.json'), raw)
        finally: os.close(fd)













    def test_wrong_request_missing_old_hash_or_asset_never_creates_job(self):
        cases = ('request', 'data', 'asset', 'hash', 'size')
        for case in cases:
            with self.subTest(case=case):
                request, data, assets, pins = self.request.copy(), self.data.copy(), self.assets.copy(), self.pins.copy()
                if case == 'request': request['operation'] = 'four-tx'
                if case == 'data': data['old_receipt_sha256'] = None
                if case == 'asset': assets['unbound.py'] = b'bad'
                if case == 'hash': pins['guard.py'] = {'sha256': '0'*64, 'bytes': len(assets['guard.py'])}
                if case == 'size': pins['guard.py'] = {'sha256': M.sha(assets['guard.py']), 'bytes': True}
                value = M.run_setup_phase(request, self.context, 'context', assets, pins, data)
                self.assertEqual(value['status'], 'FAIL_KEEP_STATE_NO_RETRY')
                self.assertFalse((self.base / M.NAMESPACE / 'jobs').exists())

    def test_phase_bindings_require_three_inherited_receipts_and_forbid_future_context(self):
        for phase, number in (('context', 2), ('image', 3)):
            data = {key: 'a'*64 if n <= number else None for n, key in enumerate(M.DATA_KEYS)}
            M.phase_data_check(phase, data)
            for key in M.DATA_KEYS[:number+1]:
                with self.subTest(phase=phase, missing=key), self.assertRaises(M.Stop):
                    M.phase_data_check(phase, {**data, key: None})
        with self.assertRaises(M.Stop):
            M.phase_data_check('context', {**self.data, 'context_ready_sha256': 'a'*64})


    def test_closed_driver_result_and_bindings_never_admit_native_or_paths(self):
        for change in ({'native_qualified': True}, {'native_go_consumed': True}, {'ready_sha256': 'A'*64},
                       {'extra': 'private'}, {'bindings': {'arbitrary/path': {'sha256':'a'*64, 'metadata':[1]*12}}},
                       {'bindings': {'historical_receipt': {'sha256': None, 'metadata':[1]*12}}},
                       {'bindings': {'historical_receipt': {'sha256': 'a'*64, 'metadata':[True]*12}}}):
            with self.subTest(change=change), self.assertRaises(M.Stop):
                M.result_check({**self.result, **change}, 'context')
        value = {**self.result, 'bindings': {'public_repository': {'sha256': None, 'metadata': [1]*12}}}
        M.result_check(value, 'context')

    def test_sources_are_private_pinned_single_link_and_preserve_nanoseconds(self):
        root, job, raw = self.job()
        try:
            assets = M.load_job(root, self.nonce, raw)[2]
            self.assertEqual(assets, self.assets)
            info = os.stat(self.base / M.NAMESPACE / 'jobs' / self.nonce / 'guard.py')
            self.assertEqual(stat.S_IMODE(info.st_mode), 0o500)
            self.overrides[(info.st_dev, info.st_ino)] = {'st_uid': 1000}
            with self.assertRaisesRegex(M.Stop, 'FILE_IDENTITY'): M.load_job(root, self.nonce, raw)
            self.overrides.clear()
            original = M.os.read
            def read(fd, size):
                data = original(fd, size)
                st = os.fstat(fd)
                if st.st_ino == info.st_ino:
                    self.overrides[(info.st_dev, info.st_ino)] = {'st_ctime_ns': info.st_ctime_ns + 1}
                return data
            with patch.object(M.os, 'read', side_effect=read):
                with self.assertRaisesRegex(M.Stop, 'FILE_CHANGED'): M.regular(root, 'guard.py', M.ASSET_CAP, 0o500)
        finally: os.close(root)

    def test_source_symlink_hardlink_and_hash_drift_are_rejected(self):
        root, job, raw = self.job()
        path = self.base / M.NAMESPACE / 'jobs' / self.nonce / 'guard.py'
        kept = path.with_name('kept-own-fixture')
        try:
            path.rename(kept); path.symlink_to(kept)
            with self.assertRaises(OSError): M.load_job(root, self.nonce, raw)
            path.unlink(); kept.rename(path)
            os.link(path, kept)
            with self.assertRaisesRegex(M.Stop, 'FILE_IDENTITY'): M.load_job(root, self.nonce, raw)
            kept.unlink()
            path.chmod(0o700)
            fd = os.open(path, os.O_WRONLY | os.O_TRUNC); os.write(fd, b'CHANGED\n'); os.close(fd)
            path.chmod(0o500)
            with self.assertRaisesRegex(M.Stop, 'ASSET_PIN'): M.load_job(root, self.nonce, raw)
        finally: os.close(root)

    def test_partial_new_source_write_is_retained_and_error_is_bounded(self):
        real = M.os.write
        def write(fd, raw):
            if raw.startswith(b'SYNTHETIC'): return real(fd, raw[:1])
            if raw.startswith(b'YNTHETIC'): raise OSError(28, '/synthetic-private-path')
            return real(fd, raw)
        with patch.object(M.os, 'write', side_effect=write):
            with self.assertRaises(OSError): self.job()
        root = M.private_dir(str(self.base / M.NAMESPACE / 'jobs' / self.nonce))
        try:
            self.assertTrue(M.absent(root, 'guard.py'))
            partials = [name for name in os.listdir(root) if name.startswith('.setup-write-')]
            self.assertEqual(len(partials), 1)
            self.assertEqual(M.regular(root, partials[0], M.ASSET_CAP, 0o500), b'S')
            error = M.regular(root, 'FIRST_ERROR.PRIVATE.json')
            self.assertNotIn(b'/synthetic-private-path', error)
        finally: os.close(root)

    def test_atomic_protocol_publication_exposes_no_partial_bytes_to_cooperative_peer(self):
        root = M.private_dir(str(self.base))
        real_write, real_regular = M.os.write, M.regular
        try:
            for final in ('ARM.PRIVATE.json', 'ACK.PRIVATE.json', 'RESULT.PENDING.PRIVATE.json'):
                with self.subTest(final=final):
                    observed = []
                    def peer():
                        with self.assertRaises(FileNotFoundError): os.open(final, M.R, dir_fd=root)
                        observed.append(True)
                    def write(fd, raw):
                        peer()
                        return real_write(fd, raw[:1])
                    def readback(fd, name, cap=M.CAP, mode=0o600):
                        peer()
                        self.assertTrue(name.startswith('.setup-write-'))
                        return real_regular(fd, name, cap, mode)
                    raw = b'{"synthetic":"complete-before-publication"}\n'
                    with patch.object(M.os, 'write', side_effect=write), patch.object(M, 'regular', side_effect=readback):
                        M.write_new(root, final, raw)
                    self.assertGreater(len(observed), 2)
                    self.assertEqual(M.regular(root, final), raw)
                    self.assertFalse(any(name.startswith('.setup-write-') for name in os.listdir(root)))
        finally: os.close(root)

    def test_atomic_readback_failure_retains_temp_and_exposes_no_final(self):
        root = M.private_dir(str(self.base))
        raw = b'{"synthetic":"readback"}\n'
        try:
            with patch.object(M, 'regular', return_value=b'wrong-readback'):
                with self.assertRaisesRegex(M.Stop, 'WRITE_READBACK'): M.write_new(root, 'ARM.PRIVATE.json', raw)
            self.assertTrue(M.absent(root, 'ARM.PRIVATE.json'))
            names = [name for name in os.listdir(root) if name.startswith('.setup-write-')]
            self.assertEqual(len(names), 1)
            self.assertEqual(M.regular(root, names[0]), raw)
        finally: os.close(root)

    def test_atomic_rename_failure_retains_verified_temp_and_exposes_no_final(self):
        root = M.private_dir(str(self.base))
        raw = b'{"synthetic":"rename"}\n'
        function = types.SimpleNamespace(argtypes=None, restype=None)
        class Rename:
            def __call__(self, *args): return -1
        function = Rename()
        try:
            with patch.object(M.ctypes, 'CDLL', return_value=types.SimpleNamespace(renameat2=function)), \
                    patch.object(M.ctypes, 'get_errno', return_value=18):
                with self.assertRaises(OSError): M.write_new(root, 'ACK.PRIVATE.json', raw)
            self.assertTrue(M.absent(root, 'ACK.PRIVATE.json'))
            names = [name for name in os.listdir(root) if name.startswith('.setup-write-')]
            self.assertEqual(len(names), 1)
            self.assertEqual(M.regular(root, names[0]), raw)
        finally: os.close(root)

    def test_atomic_duplicate_noreplace_preserves_final_bytes_and_full_metadata(self):
        root = M.private_dir(str(self.base))
        name, first, second = 'ARM.PRIVATE.json', b'first\n', b'second\n'
        try:
            M.write_new(root, name, first)
            before = M.metadata(os.stat(name, dir_fd=root, follow_symlinks=False))
            with self.assertRaises(FileExistsError): M.write_new(root, name, second)
            self.assertEqual(M.regular(root, name), first)
            self.assertEqual(M.metadata(os.stat(name, dir_fd=root, follow_symlinks=False)), before)
            names = [item for item in os.listdir(root) if item.startswith('.setup-write-')]
            self.assertEqual(len(names), 1)
            self.assertEqual(M.regular(root, names[0]), second)
        finally: os.close(root)

    def test_safe_error_does_not_copy_arbitrary_exception_text(self):
        raw = M.encoded(M.safe_error(ValueError('/synthetic-secret/path'), 'image'))
        self.assertNotIn(b'synthetic-secret', raw)
        self.assertIn(b'FILESYSTEM_OR_PHASE_FAILURE', raw)

    def test_worker_positive_arm_ack_and_publication_never_spawns_after_pending(self):
        root, job, raw, child, stop = self.worker_fixture()
        try:
            with patch.object(M.os, 'fork', side_effect=AssertionError('no uncontrolled fork')):
                self.assertEqual(M.worker(self.nonce), 0)
            self.assertEqual(M.parsed(M.regular(root, 'RESULT.PRIVATE.json')), self.result)
            self.assertTrue(M.absent(root, 'RESULT.PENDING.PRIVATE.json'))
            child.assert_called_once(); stop.assert_not_called()
        finally: os.close(root)

    def test_wrong_arm_cannot_call_phase(self):
        root, job, raw, child, stop = self.worker_fixture(bad_arm=True)
        try:
            self.assertEqual(M.worker(self.nonce), 1)
            child.assert_not_called(); stop.assert_called_once()
            self.assertEqual(M.parsed(M.regular(root, 'FIRST_ERROR.PRIVATE.json'))['code'], 'ARM_BINDING')
        finally: os.close(root)

    def test_controller_loss_before_arm_never_calls_phase(self):
        root, job, raw, child, stop = self.worker_fixture(arm=False)
        try:
            with patch.object(M, 'worker_watch', side_effect=M.Stop('CONTROLLER_LOST')):
                self.assertEqual(M.worker(self.nonce), 1)
            child.assert_not_called(); stop.assert_called_once()
        finally: os.close(root)

    def test_controller_loss_during_phase_preserves_first_cause_then_requests_own_stop(self):
        root, job, raw, child, stop = self.worker_fixture()
        try:
            child.side_effect = M.Stop('CAPACITY')
            self.assertEqual(M.worker(self.nonce), 1)
            self.assertEqual(M.parsed(M.regular(root, 'FIRST_ERROR.PRIVATE.json'))['code'], 'CAPACITY')
            stop.assert_called_once()
        finally: os.close(root)

    def test_wrong_ack_keeps_pending_and_cannot_publish_or_spawn_cleanup_child(self):
        root, job, raw, child, stop = self.worker_fixture(bad_ack=True)
        try:
            self.assertEqual(M.worker(self.nonce), 1)
            self.assertFalse(M.absent(root, 'RESULT.PENDING.PRIVATE.json'))
            self.assertTrue(M.absent(root, 'RESULT.PRIVATE.json')); stop.assert_not_called()
        finally: os.close(root)

    def test_pending_postrename_fsync_failure_after_peer_ack_never_spawns_stop(self):
        root, job, raw, child, stop = self.worker_fixture(ack=False)
        real_fsync, failed = M.os.fsync, []
        def fsync(fd):
            if not failed and not ORIGINAL_ABSENT(root, 'RESULT.PENDING.PRIVATE.json'):
                failed.append(True)
                ack = {'schema': 'helmut-context-daemon-binding-v2-service-ack-v1', 'nonce': self.nonce,
                    'job_sha256': M.sha(raw),
                    'result_sha256': M.sha(M.regular(root, 'RESULT.PENDING.PRIVATE.json')),
                    'worker': self.facts(os.getpid())}
                M.write_new(root, 'ACK.PRIVATE.json', M.encoded(ack))
                raise OSError(28, 'synthetic-postrename-directory-fsync')
            return real_fsync(fd)
        try:
            with patch.object(M.os, 'fsync', side_effect=fsync), \
                    patch.object(M.os, 'fork', side_effect=AssertionError('no fork after pending')):
                self.assertEqual(M.worker(self.nonce), 1)
            self.assertTrue(failed)
            self.assertFalse(M.absent(root, 'ACK.PRIVATE.json'))
            self.assertFalse(M.absent(root, 'RESULT.PENDING.PRIVATE.json'))
            self.assertTrue(M.absent(root, 'RESULT.PRIVATE.json'))
            child.assert_called_once(); stop.assert_not_called(); M.command.assert_not_called()
        finally: os.close(root)

    def test_parked_controller_loss_cannot_publish_or_spawn(self):
        root, job, raw, child, stop = self.worker_fixture(ack=False)
        real_absent = ORIGINAL_ABSENT
        def watch(*args):
            if not real_absent(root, 'RESULT.PENDING.PRIVATE.json'): raise M.Stop('CONTROLLER_LOST')
        try:
            with patch.object(M, 'worker_watch', side_effect=watch): self.assertEqual(M.worker(self.nonce), 1)
            self.assertTrue(M.absent(root, 'RESULT.PRIVATE.json')); stop.assert_not_called()
        finally: os.close(root)

    def test_existing_partial_worker_state_is_never_adopted(self):
        root, job, raw, child, stop = self.worker_fixture()
        try:
            M.write_new(root, 'RESULT.PENDING.PRIVATE.json', M.encoded(self.result))
            self.assertEqual(M.worker(self.nonce), 1); child.assert_not_called()
        finally: os.close(root)

    def test_positive_real_own_fork_requires_complete_json_eof_and_exit_zero(self):
        root, job, raw = self.job()
        os.close(root)
        assets = self.assets.copy()
        assets['driver.py'] = ('def execute_phase(phase, data, modules, deadline):\n'
            '    assert modules["restore"]["__source_bytes__"] == b"SYNTHETIC = True\\n"\n'
            '    assert modules["restore"]["__file__"].endswith("/restore.py")\n'
            '    return ' + repr(self.result) + '\n').encode()
        with patch.object(M, 'worker_watch'):
            self.assertEqual(M.phase_child(job, assets, -1), self.result)
        assets['driver.py'] = b'def execute_phase(*args):\n    raise ValueError("/synthetic-private-path")\n'
        with patch.object(M, 'worker_watch'):
            with self.assertRaisesRegex(M.Stop, 'PHASE_FAILED') as caught: M.phase_child(job, assets, -1)
        self.assertNotIn('/synthetic-private-path', str(caught.exception.phase_error))



    def test_directory_cgroup_walk_includes_new_session_and_nested_members(self):
        cg = self.base / 'cg'; cg.mkdir()
        (cg / 'cgroup.procs').write_bytes(b'4242\n')
        nested = cg / 'git-session'; nested.mkdir(); (nested / 'cgroup.procs').write_bytes(b'4243\n')
        # Session/group identity cannot remove a PID from the recursive unit CG proof.
        original_directory = M.directory
        def directory(path):
            if path.startswith('/sys/fs/cgroup/'): return os.open(cg, M.D)
            return original_directory(path)
        with patch.object(M, 'directory', side_effect=directory):
            self.assertEqual(M.cgroup_pids(self.baseline['cgroup']), [4242, 4243])

    def test_stop_never_targets_a_unit_without_fresh_identity(self):
        root, job, raw = self.job()
        try:
            with patch.object(M, 'worker_identity', side_effect=M.Stop('WORKER_CHANGED')):
                with self.assertRaises(M.Stop): M.stop_owned(job, root, raw, self.baseline)
            M.command.assert_not_called()
        finally: os.close(root)

    def test_worker_identity_binds_actual_python_argv_namespace_source_and_unit(self):
        root, job, raw = self.job()
        fields = self.unit_fields(job)
        kernel = {'/proc/4242/cmdline': b'\0'.join(p.encode() for p in M.worker_argv(self.nonce)[4:])+b'\0',
                  '/proc/4242/cgroup': ('0::'+self.baseline['cgroup']+'\n').encode()}
        previous_stat = M.os.stat
        python = types.SimpleNamespace(st_mode=stat.S_IFREG|0o755, st_uid=0, st_gid=0, st_dev=9, st_ino=10)
        def file_stat(path, *args, **kwargs):
            if str(path) in ('/proc/4242/exe', '/usr/bin/python3'): return python
            return previous_stat(path, *args, **kwargs)
        try:
            with patch.object(M, 'unit_snapshot', return_value=fields), \
                    patch.object(M, 'kernel_read', side_effect=lambda path, cap:kernel[path]), \
                    patch.object(M.os, 'stat', side_effect=file_stat):
                proof = M.worker_identity(job, root, raw)
                self.assertEqual(proof['worker'], self.facts(4242))
                kernel['/proc/4242/cmdline'] = b'foreign\0'
                with self.assertRaisesRegex(M.Stop, 'WORKER_COMMAND'): M.worker_identity(job, root, raw)
                kernel['/proc/4242/cmdline'] = b'\0'.join(p.encode() for p in M.worker_argv(self.nonce)[4:])+b'\0'
                kernel['/proc/4242/cgroup'] = b'0::/foreign\n'
                with self.assertRaisesRegex(M.Stop, 'WORKER_CGROUP'): M.worker_identity(job, root, raw)
                kernel['/proc/4242/cgroup'] = ('0::'+self.baseline['cgroup']+'\n').encode()
                with patch.object(M, 'process', return_value={**self.facts(4242), 'namespace':[99, 99]}):
                    with self.assertRaisesRegex(M.Stop, 'WORKER_CHANGED'): M.worker_identity(job, root, raw)
                with patch.object(M, 'process', side_effect=[self.facts(4242), {**self.facts(4242), 'start_ticks':12346}]):
                    with self.assertRaisesRegex(M.Stop, 'WORKER_CHANGED'): M.worker_identity(job, root, raw)
        finally: os.close(root)



    def test_controller_pidfd_and_kernel_change_fail_closed(self):
        root, job, raw = self.job(); os.close(root)
        with patch.object(M, 'exited', return_value=True):
            with self.assertRaisesRegex(M.Stop, 'CONTROLLER_LOST'): M.controller_alive(job, -1)
        with patch.object(M, 'exited', return_value=False), patch.object(M, 'boot_id', return_value='different'):
            with self.assertRaisesRegex(M.Stop, 'CONTROLLER_LOST'): M.controller_alive(job, -1)

    def test_child_error_closed_schema_prevents_private_text_injection(self):
        error = M.safe_error(M.Stop('CAPACITY'), 'context')
        M.error_check(error, 'context')
        for change in ({'code':'/private/path'}, {'extra':'private'}, {'phase':'image'}, {'native_qualified':True}):
            with self.subTest(change=change), self.assertRaises(M.Stop): M.error_check({**error, **change}, 'context')

    def unit_fields(self, job, finished=False):
        fields = dict.fromkeys(M.PROPERTIES, '')
        fields.update(Id=M.unit_name(self.nonce), Transient='yes', Type='exec', MainPID='4242',
            ControlPID='0', ControlGroup=self.baseline['cgroup'], KillMode='control-group', RuntimeMaxUSec=str(job['runtime_seconds'])+'s',
            TimeoutStopUSec='5s', Restart='no', RemainAfterExit='yes', User='root', Group='root', UMask='0077',
            StandardOutput='null', StandardError='null', Delegate='no', SendSIGKILL='yes', KillSignal='15',
            FinalKillSignal='9', TimeoutStopFailureMode='kill', InvocationID='f'*32,
            ActiveState='active', SubState='running', ExecMainPID='4242', ExecMainCode='0', ExecMainStatus='0',
            ExecMainStartTimestampMonotonic='100000', ExecMainExitTimestampMonotonic='0', Result='success')
        fields['ExecStart'] = '{ path=/usr/bin/env ; argv[]=' + ' '.join(M.worker_argv(self.nonce, M.job_namespace(job))) + ' ; ignore_errors=no ; pid=4242 ; }'
        if finished: fields.update(MainPID='0', ExecMainCode='1', SubState='exited', ExecMainExitTimestampMonotonic='200000')
        return fields

    def unit_observation(self, fields):
        return ('\n'.join(k+'='+v for k,v in fields.items())+'\n').encode()

    def unit_command(self, job, fields=None, hooks=None, identity=None, after=None):
        fields = self.unit_fields(job) if fields is None else fields
        hooks = {} if hooks is None else hooks
        name = M.unit_name(self.nonce)
        path = '/org/freedesktop/systemd1/unit/' + name.replace('-', '_2d').replace('.', '_2e')
        shown = []
        def command(argv, deadline):
            self.assertEqual(deadline, job['deadline'])
            if argv[0] == '/usr/bin/systemctl':
                self.assertEqual(argv, ['/usr/bin/systemctl', 'show', name, '--no-pager',
                                        '--property=' + ','.join(M.PROPERTIES)])
                shown.append(True)
                return self.unit_observation(after if after is not None and len(shown) > 1 else fields)
            key = argv[-1]
            self.assertIn(key, ('Id', 'ExecStartPre', 'ExecStartPost', 'ExecCondition',
                                'ExecStop', 'ExecStopPost', 'ExecReload'))
            self.assertEqual(argv, ['/usr/bin/busctl', '--system', '--json=short', 'get-property',
                'org.freedesktop.systemd1', path,
                'org.freedesktop.systemd1.Unit' if key == 'Id' else 'org.freedesktop.systemd1.Service', key])
            if key == 'Id':
                return M.encoded({'type': 's', 'data': name if identity is None else identity})
            return hooks.get(key, b'{"type":"a(sasbttttuii)","data":[]}\n')
        return command

    def test_unit_properties_argv_kill_bounds_and_exit_are_checked(self):
        root, job, raw = self.job(); os.close(root)
        fields = self.unit_fields(job)
        with patch.object(M, 'command', side_effect=self.unit_command(job, fields)):
            self.assertEqual(M.unit_snapshot(job)['MainPID'], '4242')
        for change in ({'Transient':'no'}, {'KillMode':'process'}, {'SendSIGKILL':'no'}, {'Restart':'always'},
                       {'RuntimeMaxUSec':'999s'}, {'User':'1000'},
                       {'ExecStart':fields['ExecStart'].replace('guard.py','foreign.py')}, {'ControlGroup':'/foreign'}):
            with self.subTest(change=change), patch.object(M, 'command', side_effect=self.unit_command(job, {**fields, **change})):
                with self.assertRaises(M.Stop): M.unit_snapshot(job)
        finished = self.unit_fields(job, finished=True)
        finished['ControlGroup'] = ''  # Missing CG alone is never the exit proof.
        with patch.object(M, 'command', side_effect=self.unit_command(job, finished)):
            M.unit_snapshot(job, finished=True)
        finished['ExecMainCode'] = '2'
        with patch.object(M, 'command', side_effect=self.unit_command(job, finished)):
            with self.assertRaisesRegex(M.Stop, 'UNIT_EXIT'): M.unit_snapshot(job, finished=True)



    def test_observed_missing_six_hooks_requires_all_six_explicit_typed_empty_arrays(self):
        root, job, raw = self.job(); os.close(root)
        fields = self.unit_fields(job)
        hooks = {'ExecCondition', 'ExecReload', 'ExecStartPost', 'ExecStartPre', 'ExecStop', 'ExecStopPost'}
        self.assertEqual(set(M.HOOK_PROPERTIES), hooks)
        self.assertTrue(hooks.isdisjoint(fields))  # Exact observed systemctl omission, including with --all.
        with patch.object(M, 'command', side_effect=self.unit_command(job, fields)) as control:
            self.assertEqual(M.unit_snapshot(job), fields)
        self.assertEqual(control.call_count, 9)
        self.assertEqual([call.args[0][-1] for call in control.call_args_list[2:-1]], list(M.HOOK_PROPERTIES))

    def test_each_nonempty_typed_hook_is_rejected(self):
        root, job, raw = self.job(); os.close(root)
        extra = M.encoded({'type': 'a(sasbttttuii)', 'data':
            [['/bin/false', ['/bin/false'], False, 0, 0, 0, 0, 0, 0, 0]]})
        for key in M.HOOK_PROPERTIES:
            with self.subTest(key=key), patch.object(M, 'command', side_effect=self.unit_command(job, hooks={key: extra})):
                with self.assertRaisesRegex(M.Stop, '^UNIT_EXTRA_COMMAND$'): M.unit_snapshot(job)

    def test_hook_missing_wrong_signature_structure_duplicate_or_extra_json_stops(self):
        root, job, raw = self.job(); os.close(root)
        invalid = (b'', b'\n', b'not-json', b'null', b'[]', b'{}', b'{"type":"a(sasbttttuii)"}',
            b'{"data":[]}', b'{"type":"as","data":[]}', b'{"type":"a(sasbttttuii)","data":[[]]}',
            b'{"type":"a(sasbttttuii)","data":null}', b'{"type":"a(sasbttttuii)","data":{}}',
            b'{"type":"a(sasbttttuii)","data":""}', b'{"type":"a(sasbttttuii)","data":false}',
            b'{"type":"a(sasbttttuii)","data":0}', b'{"type":[],"data":[]}',
            b'{"type":"a(sasbttttuii)","data":[],"extra":[]}',
            b'{"type":"a(sasbttttuii)","type":"a(sasbttttuii)","data":[]}',
            b'{"type":"a(sasbttttuii)","data":[],"data":[]}',
            b'{"type":"a(sasbttttuii)","data":[]}\n{"type":"a(sasbttttuii)","data":[]}',
            b'{"type":"a(sasbttttuii)","data":NaN}', b'\xff')
        for reply in invalid:
            with self.subTest(reply=reply), patch.object(M, 'command', side_effect=self.unit_command(job, hooks={'ExecStartPre': reply})):
                with self.assertRaises(M.Stop): M.unit_snapshot(job)

    def test_scalar_properties_remain_closed_complete_and_unique(self):
        root, job, raw = self.job(); os.close(root)
        fields = self.unit_fields(job)
        for key in M.PROPERTIES:
            missing = {name: value for name, value in fields.items() if name != key}
            with self.subTest(missing=key), patch.object(M, 'command', side_effect=self.unit_command(job, missing)) as control:
                with self.assertRaisesRegex(M.Stop, '^UNIT_PROPERTIES$'): M.unit_snapshot(job)
                self.assertEqual(control.call_count, 1)
        for key in ('Foreign', *M.HOOK_PROPERTIES):
            with self.subTest(extra=key), patch.object(M, 'command', side_effect=self.unit_command(job, {**fields, key: ''})):
                with self.assertRaisesRegex(M.Stop, '^UNIT_PROPERTIES$'): M.unit_snapshot(job)
        duplicate = self.unit_observation(fields) + b'Id=' + fields['Id'].encode() + b'\n'
        with patch.object(M, 'command', return_value=duplicate):
            with self.assertRaisesRegex(M.Stop, '^UNIT_FORMAT$'): M.unit_snapshot(job)

    def test_dbus_object_identity_and_bracketed_unit_drift_fail_closed(self):
        root, job, raw = self.job(); os.close(root)
        fields = self.unit_fields(job)
        with patch.object(M, 'command', side_effect=self.unit_command(job, identity='foreign.service')) as control:
            with self.assertRaisesRegex(M.Stop, '^UNIT_DBUS_IDENTITY$'): M.unit_snapshot(job)
            self.assertEqual(control.call_count, 2)
        for change in ({'InvocationID': 'e'*32}, {'MainPID': '4243'}, {'ExecMainPID': '4243'},
                       {'ExecMainStartTimestampMonotonic': '100001'}, {'ControlGroup': '/foreign'},
                       {'ExecStart': fields['ExecStart'] + 'foreign'}, {'SubState': 'exited'}):
            with self.subTest(change=change), patch.object(M, 'command', side_effect=self.unit_command(job, after={**fields, **change})):
                with self.assertRaisesRegex(M.Stop, '^UNIT_CHANGED$'): M.unit_snapshot(job)

    def test_each_control_query_failure_stops_without_retry_or_empty_fallback(self):
        root, job, raw = self.job(); os.close(root)
        for fail_at in range(1, 10):
            for error in ('CONTROL_COMMAND_FAILED', 'CONTROL_COMMAND_LIMIT', 'CONTROL_COMMAND_DEADLINE'):
                answer, calls = self.unit_command(job), []
                def command(argv, deadline):
                    calls.append(argv)
                    if len(calls) == fail_at: raise M.Stop(error)
                    return answer(argv, deadline)
                with self.subTest(fail_at=fail_at, error=error), patch.object(M, 'command', side_effect=command):
                    with self.assertRaisesRegex(M.Stop, '^'+error+'$'): M.unit_snapshot(job)
                    self.assertEqual(len(calls), fail_at)

    def test_hook_failure_prevents_arm_and_preserves_first_error_without_service_retry(self):
        # A successful command with no D-Bus output is unknown, never an empty hook.
        def command(argv, deadline):
            job = M.parsed((self.base / M.NAMESPACE / 'jobs' / self.nonce / 'JOB.PRIVATE.json').read_bytes())
            return self.unit_command(job, hooks={'ExecStartPre': b''})(argv, deadline)
        with patch.object(M, 'start_service') as start, patch.object(M, 'command', side_effect=command) as control:
            result = self.run_guard()
        self.assertEqual(result['status'], 'FAIL_KEEP_STATE_NO_RETRY')
        self.assertEqual(result['code'], 'UNIT_DBUS_FORMAT')
        start.assert_called_once(); self.assertEqual(control.call_count, 3)
        path = self.base / M.NAMESPACE / 'jobs' / self.nonce
        self.assertFalse(any((path / name).exists() for name in
            ('ARM.PRIVATE.json', 'RESULT.PENDING.PRIVATE.json', 'RESULT.PRIVATE.json', 'ACK.PRIVATE.json')))
        first = (path / 'FIRST_ERROR.PRIVATE.json').read_bytes()
        self.assertEqual(M.parsed(first)['code'], 'UNIT_DBUS_FORMAT')
        with patch.object(M, 'start_service') as restart:
            self.assertEqual(self.run_guard()['status'], 'FAIL_KEEP_STATE_NO_RETRY')
            restart.assert_not_called()
        self.assertEqual((path / 'FIRST_ERROR.PRIVATE.json').read_bytes(), first)

    def test_start_command_clears_environment_and_confines_all_sessions_to_unit(self):
        root, job, raw = self.job(); os.close(root)
        with patch.object(M, 'command') as command: M.start_service(job)
        argv = command.call_args.args[0]
        for property in ('KillMode=control-group', 'SendSIGKILL=yes', 'Restart=no', 'RemainAfterExit=yes'):
            self.assertIn('--property='+property, argv)
        self.assertEqual(argv[-len(M.worker_argv(self.nonce)):], M.worker_argv(self.nonce))
        self.assertEqual(M.worker_argv(self.nonce)[:4], ['/usr/bin/env', '-i', 'PATH='+M.ENV['PATH'], 'LC_ALL=C'])

    def test_deadline_nan_floor_and_phase_margins_fail_before_actions(self):
        with patch.object(M.os, 'statvfs', return_value=types.SimpleNamespace(f_bavail=0, f_frsize=1)):
            with self.assertRaisesRegex(M.Stop, 'CAPACITY'): ORIGINAL_BOUNDED(time.monotonic()+20)
        for deadline in (float('nan'), True, time.monotonic()-1, time.monotonic()+301):
            with self.subTest(deadline=deadline), self.assertRaises(M.Stop): ORIGINAL_BOUNDED(deadline, capacity=False)
        self.assertEqual(M.MARGIN['context'], 90); self.assertEqual(M.MARGIN['image'], 70)

    def test_default_cli_is_inert_and_no_delete_or_native_entrypoint_exists(self):
        with contextlib.redirect_stdout(io.StringIO()): self.assertEqual(M.main([]), 2)
        self.assertNotIn(b'os.unlink(', RAW); self.assertNotIn(b'os.remove(', RAW)
        self.assertNotIn(b'four-tx', RAW)


    def test_fixed_new_root_worker_argv_schemas_and_inert_old_flags(self):
        root = str(self.base) + '/' + M.NAMESPACE + '/jobs'
        self.assertEqual(M.jobs_root(), root)
        self.assertEqual(M.worker_argv(self.nonce), ['/usr/bin/env', '-i', 'PATH='+M.ENV['PATH'],
            'LC_ALL=C', '/usr/bin/python3', '-I', '-S', '-B', root+'/'+self.nonce+'/guard.py',
            '--context-daemon-binding-v2-phase-worker', self.nonce])
        for namespace in ('legacy', 'setup-successor-unit-properties-v1', '', '../setup-jobs', None, True, []):
            with self.subTest(namespace=namespace), self.assertRaises(M.Stop): M.jobs_root(namespace)
        fd, job, raw = self.job()
        try:
            self.assertEqual(job['schema'], 'helmut-context-daemon-binding-v2-service-job-v1')
            self.assertEqual(job['job_namespace'], M.NAMESPACE)
            for bad in ({**job, 'schema': 'helmut-setup-service-job-v1'},
                    {**job, 'schema': 'helmut-setup-service-job-successor-v1'},
                    {**job, 'job_namespace': 'legacy'}, {**job, 'job_namespace': '/tmp/free'},
                    {k:v for k,v in job.items() if k != 'job_namespace'}, {**job, 'extra': True}):
                with self.subTest(bad=bad), self.assertRaises(M.Stop): M.job_check(bad, self.nonce)
        finally: os.close(fd)
        with patch.object(M, 'worker', return_value=0) as worker:
            self.assertEqual(M.main(['--context-daemon-binding-v2-phase-worker', self.nonce]), 0)
            worker.assert_called_once_with(self.nonce, M.NAMESPACE); worker.reset_mock()
            for flag in ('--setup-phase-worker', '--setup-successor-phase-worker', '--setup-worker', '/tmp/free'):
                with contextlib.redirect_stdout(io.StringIO()): self.assertEqual(M.main([flag, self.nonce]), 2)
            worker.assert_not_called()

    def test_recovery_checkout_rejected_before_service_files_or_child_creation(self):
        for phase in ('recover', 'checkout', 'unknown'):
            with self.subTest(phase=phase), patch.object(M, 'private_dir') as directory, \
                    patch.object(M, 'start_service') as service, patch.object(M.os, 'pipe2') as pipe:
                value = M.run_setup_phase(self.request, self.context, phase, self.assets, self.pins, self.data)
                self.assertEqual(value['code'], 'PHASE_DATA')
                with self.assertRaisesRegex(M.Stop, '^PHASE_DATA$'):
                    M.create_job(self.request, self.context, phase, self.assets, self.pins, self.data)
                with self.assertRaisesRegex(M.Stop, '^PHASE_DATA$'):
                    M.phase_child({'phase': phase, 'phase_data': self.data}, self.assets, -1)
                directory.assert_not_called(); service.assert_not_called(); pipe.assert_not_called()

    def test_new_root_is_required_private_and_never_falls_back(self):
        state = self.base / M.NAMESPACE
        state.rmdir()
        with patch.object(M, 'start_service') as start:
            self.assertEqual(self.run_guard()['status'], 'FAIL_KEEP_STATE_NO_RETRY'); start.assert_not_called()
        self.assertFalse((self.base / 'setup-jobs').exists())
        state.mkdir(mode=0o700); state.chmod(0o755)
        self.assertEqual(self.run_guard()['code'], 'DIRECTORY_PRIVATE')
        self.assertFalse((state / 'jobs').exists()); state.rmdir(); state.symlink_to(self.base)
        self.assertEqual(self.run_guard()['status'], 'FAIL_KEEP_STATE_NO_RETRY'); state.unlink()
        for namespace in ('legacy', '', '/tmp/free', '../setup-jobs', None, [], True):
            with self.subTest(namespace=namespace), patch.object(M, 'private_dir') as directory:
                with self.assertRaises(M.Stop):
                    M.create_job(self.request, {**self.context, 'job_namespace': namespace}, 'context', self.assets, self.pins, self.data)
                directory.assert_not_called()

    def test_both_phases_preserve_legacy_first_error_temp_once_jobs_and_receipts(self):
        old = self.base / 'setup-successor-unit-properties-v1'
        old.mkdir(mode=0o700)
        legacy_paths = ['FIRST_ERROR.PRIVATE.json', '.setup-write-held.tmp', 'once/plan.json',
                        'jobs/old/JOB.PRIVATE.json', 'phases/recover/ACCEPTED.SAFE.json',
                        'phases/checkout/ACCEPTED.SAFE.json', 'phases/context/FIRST_ERROR.PRIVATE.json']
        for name in legacy_paths:
            path = old / name; path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            path.write_bytes(('EXPLICIT_SYNTHETIC_LEGACY_'+name).encode()); path.chmod(0o600)
        def evidence():
            result = {}
            for name in legacy_paths:
                root = M.private_dir(str((old/name).parent))
                try:
                    result[name] = (M.regular(root, (old/name).name),
                        M.metadata(os.stat((old/name).name, dir_fd=root, follow_symlinks=False)),
                        M.metadata(os.fstat(root)))
                finally: os.close(root)
            return result
        before = evidence()
        for phase in M.PHASES:
            self.request['nonce'] = self.nonce = M.sha(phase.encode())
            self.baseline['cgroup'] = '/system.slice/' + M.unit_name(self.nonce)
            self.result['phase'] = phase
            self.data['context_ready_sha256'] = '3'*64 if phase == 'image' else None
            with contextlib.ExitStack() as stack:
                previous, self.stack = self.stack, stack
                try:
                    stop = self.service(); result = self.run_guard_for_phase(phase)
                    self.assertEqual(result['status'], M.SUCCESS, result); stop.assert_not_called()
                finally: self.stack = previous
            self.assertEqual(evidence(), before)

    def run_guard_for_phase(self, phase):
        return M.run_setup_phase(self.request, self.context, phase, self.assets, self.pins, self.data)

    def test_new_unit_start_and_running_finished_snapshots_bind_only_new_worker(self):
        root, job, raw = self.job(); os.close(root)
        expected = M.worker_argv(self.nonce)
        with patch.object(M, 'command') as command: M.start_service(job)
        self.assertEqual(command.call_args.args[0][-len(expected):], expected)
        for finished in (False, True):
            fields = self.unit_fields(job, finished)
            with patch.object(M, 'command', side_effect=self.unit_command(job, fields)):
                self.assertEqual(M.unit_snapshot(job, finished=finished), fields)
            for replacement in ('--setup-phase-worker', '--setup-successor-phase-worker'):
                wrong = {**fields, 'ExecStart': fields['ExecStart'].replace('--context-daemon-binding-v2-phase-worker', replacement)}
                with self.subTest(finished=finished, replacement=replacement), patch.object(M, 'command', side_effect=self.unit_command(job, wrong)):
                    with self.assertRaisesRegex(M.Stop, 'UNIT_COMMAND'): M.unit_snapshot(job, finished=finished)

ORIGINAL_BOUNDED, ORIGINAL_ABSENT = M.bounded, M.absent
if __name__ == '__main__':
    unittest.main(verbosity=2)
