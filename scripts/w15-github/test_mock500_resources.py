"""New v2 observer/disk edges only; fictional files, no native resource starts."""
import sys
sys.dont_write_bytecode = True

import importlib.util
import os
from pathlib import Path
import tempfile
import time
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

SPEC = importlib.util.spec_from_file_location('w15_mock_resource_tests', Path(__file__).with_name('mock500_resources.py'))
R = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(R)


def sample(peak=123456):
    return {'configuredLimit': '2048000000', 'swapMaximum': '0', 'swapCurrentBytes': 0,
        'kernelLifetimePeakBytes': peak, 'currentBytes': 10000,
        'events': {key: 0 for key in ('max', 'oom', 'oom_kill', 'oom_group_kill')}}


class MockResourceChecks(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory(prefix='mock500-resource-fictional-')
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.free = 32 * 1024**3
        patched = patch.object(R.D.os, 'statvfs', side_effect=lambda path: SimpleNamespace(
            f_frsize=4096, f_blocks=16 * 1024**2, f_bavail=self.free // 4096))
        patched.start()
        self.addCleanup(patched.stop)
        self.resources = SimpleNamespace(profile=R.PROFILE, sample=Mock(side_effect=sample))

    def test_v2_is_distinct_and_historical_mock_failure_remains_failure(self):
        self.assertEqual((R.LIMIT, R.MAXIMUM, R.RESERVE), (2048000000, 1638400000, 409600000))
        self.assertIsNot(R.MockCommonResources, R.C.CommonResources)
        with self.assertRaises(Exception):
            R.C.assess(sample())
        with self.assertRaises(R.ResourceRejected):
            R.assess({**sample(), 'configuredLimit': '2560000000'})
        self.assertEqual(R.HISTORICAL_FAILURE['peakBytes'], 1644748800)
        self.assertFalse(R.HISTORICAL_FAILURE['acceptedAsPass'])
        with self.assertRaises(R.ResourceRejected):
            R.assess(sample(R.HISTORICAL_FAILURE['peakBytes']))

    def test_boundary_swap_events_and_unknown_samples_fail_closed(self):
        self.assertEqual(R.assess(sample(R.MAXIMUM))['kernelLifetimePeakBytes'], R.MAXIMUM)
        for value in (sample(R.MAXIMUM + 1), {**sample(), 'swapCurrentBytes': 1},
                      {**sample(), 'events': {'max': 1, 'oom': 0, 'oom_kill': 0, 'oom_group_kill': 0}},
                      {**sample(), 'currentBytes': True}, {}):
            with self.subTest(value=value), self.assertRaises(R.ResourceRejected):
                R.assess(value)

    def test_observer_retains_failed_original_peak_and_context(self):
        context = {'nonce': '11111111-2222-4333-8444-555555555555'}
        for name, data in {'memory.max': '2048000000', 'memory.swap.max': '0', 'memory.peak': '123456',
            'memory.current': '10000', 'memory.swap.current': '0',
            'memory.events': 'max 0\noom 0\noom_kill 0\noom_group_kill 0\n'}.items():
            (self.root / name).write_text(data)
        value = self.root.stat()
        observer = R.MockCommonResources(R.TOKEN, context, self.root, (value.st_dev, value.st_ino))
        observer.check_pid = Mock()
        with patch.object(R.C, '_kernel_directory', side_effect=lambda path: os.open(path, os.O_RDONLY | os.O_DIRECTORY)):
            self.assertEqual(observer.check_context(context)['kernelLifetimePeakBytes'], 123456)
            (self.root / 'memory.peak').write_text('1644748800')
            with self.assertRaises(R.ResourceRejected):
                observer.sample()
            self.assertFalse(observer.last_observation()['lastReadbackValid'])
            self.assertEqual(observer.last_observation()['lastObservedKernelSample']['kernelLifetimePeakBytes'], 1644748800)
        with self.assertRaises(Exception):
            observer.check_context({'nonce': 'DIFFERENT'})

    def plan(self):
        return R.admit_disk_plan(self.root, checkout_bytes=123456, binary_bytes=143299024,
                                 additional_asset_bytes=123456789)

    def test_plan_reuses_all_retained_copies_with_mock_audit_and_v2_metadata(self):
        plan = self.plan()
        self.assertEqual(plan['maximumWallSeconds'], 12600)
        self.assertEqual(plan['processingSeconds'], 10800)
        self.assertEqual(plan['commonMemoryLimitBytes'], 2048000000)
        self.assertEqual(plan['maximumActualCommonLifetimePeakBytes'], 1638400000)
        self.assertEqual(plan['requiredMemoryReserveBytes'], 409600000)
        self.assertIn('fullMock500NativeAudit', plan['budgets'])
        self.assertNotIn('fullEnd500NativeAudit', plan['budgets'])
        self.assertEqual(plan['budgets']['mockPrivateAssetSources'], 123456789)
        self.assertEqual(plan['budgets']['mockPrivateAssetMaterialization'], 123456789)
        self.assertEqual(plan['maximumSelectionBytes'], R.D.MAX_SELECTION_BYTES)
        self.assertTrue(all(plan['budgets'][key] > 0 for key in ('encryptedBackup', 'completePrivateSelection',
            'artifactTransportZipAllowance', 'offhostCipherDownload', 'authenticatedReadback', 'freshRecoveryPostgresData')))
        self.assertFalse(plan['executionAuthority'])
        self.free = plan['requiredAdditionalBytes'] - 4096
        with self.assertRaises(R.ResourceRejected):
            self.plan()

    def test_missing_additional_private_asset_sizes_never_become_zero(self):
        for value in (0, None, True):
            with self.subTest(value=value), self.assertRaises(Exception):
                R.admit_disk_plan(self.root, checkout_bytes=123456, binary_bytes=143299024,
                                 additional_asset_bytes=value)

    def test_guard_requires_original_monotonic_start_and_rejects_v3_or_tampered_plan(self):
        plan = self.plan()
        guard = R.DiskGuard(self.root, plan, self.resources, started_monotonic=time.monotonic() - 10)
        self.assertEqual(guard()['memoryProfile'], R.PROFILE)
        with patch.object(R.time, 'monotonic', return_value=guard.started + 12601):
            with self.assertRaises(R.ResourceRejected):
                guard()
        altered = {**plan, 'maximumActualCommonLifetimePeakBytes': 2048000000}
        with self.assertRaises(R.ResourceRejected):
            R.DiskGuard(self.root, altered, self.resources, started_monotonic=time.monotonic())
        with self.assertRaises(R.ResourceRejected):
            R.DiskGuard(self.root, plan, SimpleNamespace(profile='END500_V3', sample=Mock()), started_monotonic=time.monotonic())


if __name__ == '__main__':
    unittest.main()
