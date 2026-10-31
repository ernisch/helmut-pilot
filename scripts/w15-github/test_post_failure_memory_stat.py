"""Only fictional cgroup files; no native cgroup, process, data or API work."""
import sys
sys.dont_write_bytecode = True
import copy
import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


def load(name):
    spec = importlib.util.spec_from_file_location('post_failure_' + name, Path(__file__).with_name(name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


R, P = load('common_resources'), load('runner_parent')


def sample():
    return {'configuredLimit': '2560000000', 'swapMaximum': '0',
        'kernelLifetimePeakBytes': 2048073728, 'currentBytes': 2047098880,
        'swapCurrentBytes': 0, 'events': dict.fromkeys(('max', 'oom', 'oom_kill', 'oom_group_kill'), 0)}


def detail():
    return {**dict(zip(R.MEMORY_STAT_FIELDS, (12345, 23456, 34567, 45678, 56789, 67890))),
        'observedAfterFailure': True, 'peakCompositionKnown': False}


class PostFailureMemoryStatChecks(unittest.TestCase):
    def fictional_parent(self, value=None):
        tmp = tempfile.TemporaryDirectory(prefix='w15-fictional-post-failure-')
        self.addCleanup(tmp.cleanup)
        root, value = Path(tmp.name), value or sample()
        for name, data in {'memory.max': value['configuredLimit'], 'memory.swap.max': value['swapMaximum'],
            'memory.peak': str(value['kernelLifetimePeakBytes']), 'memory.current': str(value['currentBytes']),
            'memory.swap.current': str(value['swapCurrentBytes']),
            'memory.events': '\n'.join(k + ' ' + str(v) for k, v in value['events'].items()),
            'cgroup.events': 'populated 0',
            'memory.stat': '\n'.join(k + ' ' + str(v) for k, v in detail().items() if type(v) is int)}.items():
            (root / name).write_text(data)
        return root

    def binding(self, root):
        s = root.stat()
        path = R.KERNEL_ROOT / ('w15_123456_' + 'a' * 32 + '.slice')
        return R.CommonResources(R.TOKEN, {}, path, (s.st_dev, s.st_ino))

    def test_closed_schema_is_backward_compatible_and_rejects_private_or_untyped_fields(self):
        old = R.project_failure_memory(sample(), False)
        self.assertEqual(set(old), {'configuredLimitBytes', 'kernelLifetimePeakBytes', 'currentBytes',
            'swapMaximumBytes', 'swapCurrentBytes', 'lastReadbackValid', 'events'})
        self.assertEqual(R.closed_failure_memory(old), old)
        new = {**old, 'postFailureMemoryStat': detail()}
        self.assertEqual(R.closed_failure_memory(new), new)
        for malformed in ({**new, 'PRIVATE': 'FICTIONAL_CANARY'},):
            self.assertIsNone(R.closed_failure_memory(malformed))
        self.assertEqual(R.closed_failure_memory({**new, 'lastReadbackValid': True}), {**old, 'lastReadbackValid': True})
        self.assertEqual(R.closed_failure_memory({**new, 'postFailureMemoryStat': {**detail(), 'extra': 1}}), old)
        for key, invalid in [('anon', True), ('file', -1), ('kernel', 2**53), ('shmem', 'FICTIONAL_CANARY'),
                             ('file_dirty', None), ('file_writeback', 1.0),
                             ('observedAfterFailure', False), ('peakCompositionKnown', True)]:
            with self.subTest(key=key):
                self.assertEqual(R.closed_failure_memory({**old, 'postFailureMemoryStat': {**detail(), key: invalid}}), old)

    def test_worker_supervisor_and_public_python_projection_keep_details_without_io(self):
        runner = load('runner_start'); workflow = load('restore_workflow')
        memory = {**R.project_failure_memory(sample(), False), 'postFailureMemoryStat': detail()}
        packet = {'ok': False, 'phase': 'worker', 'workerPhase': 'connection-backup-collect', 'workerMemory': memory,
            'runner': {'reason': 'PARENT_READBACK_REJECTED', 'memory': memory,
                       'memorySource': 'CURRENT_REJECTED_READBACK'},
            'cleanup': dict.fromkeys(runner.D.CLEANUP_KEYS, 'UNKNOWN')}
        with patch.object(R.os, 'open', side_effect=AssertionError('IPC_MUST_NOT_READ')), \
                patch.object(R.os, 'read', side_effect=AssertionError('IPC_MUST_NOT_READ')):
            error = runner._response_error(packet)
            projected = workflow._safe_failure(error)
            self.assertEqual(projected['worker'], {'phase': 'connection-backup-collect', 'memory': memory})
            self.assertEqual(projected['runner']['memory'], memory)
            self.assertEqual(projected['cleanup'], packet['cleanup'])

    def test_same_open_parent_descriptor_projects_only_allowlisted_numeric_categories(self):
        root = self.fictional_parent()
        fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY)
        try:
            self.assertEqual(R.capture_post_failure_memory_stat(fd), detail())
            (root / 'memory.stat').write_text('file 42\nunknown_kernel_field 123\n')
            result = R.capture_post_failure_memory_stat(fd)
            self.assertEqual(result['file'], 42)
            self.assertTrue(result['observedAfterFailure'])
            self.assertFalse(result['peakCompositionKnown'])
            self.assertTrue(all(result[key] == 'UNKNOWN' for key in R.MEMORY_STAT_FIELDS if key != 'file'))
        finally:
            os.close(fd)

    def test_diagnostic_read_error_signal_oversize_duplicate_or_malformed_stays_unknown(self):
        root = self.fictional_parent()
        fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY)
        try:
            for raw in ('', 'anon 3\nanon 4\n', 'anon -1\n', 'anon 9007199254740992\n',
                        'file FICTIONAL_CANARY\n', 'anon 1 trailing\n', 'x' * 8193, '\u00ff'):
                (root / 'memory.stat').write_text(raw)
                result = R.capture_post_failure_memory_stat(fd)
                self.assertTrue(all(result[key] == 'UNKNOWN' for key in R.MEMORY_STAT_FIELDS))
            for error in (PermissionError('FICTIONAL_CANARY'), KeyboardInterrupt(), OSError('FICTIONAL_CANARY')):
                with patch.object(R.os, 'read', side_effect=error):
                    result = R.capture_post_failure_memory_stat(fd)
                    self.assertTrue(all(result[key] == 'UNKNOWN' for key in R.MEMORY_STAT_FIELDS))
            (root / 'memory.stat').unlink()
            result = R.capture_post_failure_memory_stat(fd)
            self.assertTrue(all(result[key] == 'UNKNOWN' for key in R.MEMORY_STAT_FIELDS))
        finally:
            os.close(fd)

    def test_common_rejected_sample_preserved_and_cached_projection_performs_no_io(self):
        root = self.fictional_parent()
        obj = self.binding(root)
        def opened(_): return os.open(root, os.O_RDONLY | os.O_DIRECTORY)
        with patch.object(R, '_kernel_directory', side_effect=opened), patch.object(obj, 'check_pid'):
            with self.assertRaises(R.ResourceError):
                obj.sample()
        with patch.object(R.os, 'open', side_effect=AssertionError('CACHE_MUST_NOT_READ')), \
                patch.object(R.os, 'read', side_effect=AssertionError('CACHE_MUST_NOT_READ')):
            cached = obj.failure_observation()
            self.assertEqual(cached['postFailureMemoryStat'], detail())
            del cached['postFailureMemoryStat']
            self.assertEqual(cached, R.project_failure_memory(sample(), False))

    def test_common_pass_and_pre_binding_failure_never_capture_diagnostic_stat(self):
        value = sample(); value['kernelLifetimePeakBytes'] = value['currentBytes'] = 1234
        root = self.fictional_parent(value); obj = self.binding(root)
        def opened(_): return os.open(root, os.O_RDONLY | os.O_DIRECTORY)
        with patch.object(R, '_kernel_directory', side_effect=opened), patch.object(obj, 'check_pid'), \
                patch.object(R, 'capture_post_failure_memory_stat') as capture:
            self.assertEqual(obj.sample(), value)
            capture.assert_not_called()
        with patch.object(R, '_kernel_directory', side_effect=opened), \
                patch.object(obj, 'check_pid', side_effect=R.ResourceError('FICTIONAL_CANARY')), \
                patch.object(R, 'capture_post_failure_memory_stat') as capture:
            with self.assertRaises(R.ResourceError): obj.sample()
            capture.assert_not_called()

    def test_common_signal_preserves_first_signal_when_diagnostic_itself_is_unknown(self):
        root = self.fictional_parent(); obj = self.binding(root)
        def opened(_): return os.open(root, os.O_RDONLY | os.O_DIRECTORY)
        first = KeyboardInterrupt()
        (root / 'memory.stat').unlink()
        with patch.object(R, '_kernel_directory', side_effect=opened), patch.object(obj, 'check_pid'), \
                patch.object(R, 'assess', side_effect=first):
            with self.assertRaises(KeyboardInterrupt) as observed: obj.sample()
        self.assertIs(observed.exception, first)
        self.assertEqual(first.failure_memory['kernelLifetimePeakBytes'], sample()['kernelLifetimePeakBytes'])
        self.assertTrue(all(first.failure_memory['postFailureMemoryStat'][key] == 'UNKNOWN'
                            for key in R.MEMORY_STAT_FIELDS))

    def test_parent_failure_and_signal_keep_original_sample_reason_and_closed_details(self):
        root = self.fictional_parent(); v = root.stat()
        ctx = P.context('123456', 'a' * 40, '00000000-0000-4000-8000-000000000000')
        def opened(_): return os.open(root, os.O_RDONLY | os.O_DIRECTORY)
        with patch.object(P.R, '_kernel_directory', side_effect=opened):
            with self.assertRaises(P.ProbeError) as observed:
                P.read_parent(ctx, (v.st_dev, v.st_ino), empty=True)
        self.assertEqual(observed.exception.record['code'], 'COMMON_PARENT_REJECTED')
        closed = copy.deepcopy(observed.exception.failure_memory)
        self.assertEqual(closed.pop('postFailureMemoryStat'), detail())
        self.assertEqual(closed, R.project_failure_memory(sample(), False))
        signal = KeyboardInterrupt()
        with patch.object(P.R, '_kernel_directory', side_effect=opened), \
                patch.object(P.R, 'assess', side_effect=signal):
            with self.assertRaises(KeyboardInterrupt) as observed:
                P.read_parent(ctx, (v.st_dev, v.st_ino))
        self.assertIs(observed.exception, signal)
        self.assertEqual(signal.failure_memory['postFailureMemoryStat'], detail())
        (root / 'memory.peak').write_text('1234'); (root / 'memory.current').write_text('1234')
        with patch.object(P.R, '_kernel_directory', side_effect=opened), \
                patch.object(P.R, 'capture_post_failure_memory_stat') as captured:
            P.read_parent(ctx, (v.st_dev, v.st_ino), empty=True)
            captured.assert_not_called()


if __name__ == '__main__':
    unittest.main()
