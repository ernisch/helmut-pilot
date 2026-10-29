"""New admission/guard tests only; synthetic files, no Docker or original data."""
import sys
sys.dont_write_bytecode = True

import importlib.util
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

SPEC = importlib.util.spec_from_file_location('w15_restore_resources_tests',
                                            Path(__file__).with_name('restore_resources.py'))
R = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(R)


def sample():
    return {'configuredLimit': '2560000000', 'swapMaximum': '0', 'swapCurrentBytes': 0,
            'kernelLifetimePeakBytes': 12345, 'currentBytes': 10000,
            'events': {name: 0 for name in ('max', 'oom', 'oom_kill', 'oom_group_kill')}}


class ResourceChecks(unittest.TestCase):
    def setUp(self):
        root = tempfile.TemporaryDirectory(prefix='w15-resource-fictional-')
        self.addCleanup(root.cleanup)
        self.root = Path(root.name)
        self.free = 32 * 1024 ** 3
        self.statvfs = patch.object(R.os, 'statvfs', side_effect=lambda path: SimpleNamespace(
            f_frsize=4096, f_blocks=16 * 1024 ** 2, f_bavail=self.free // 4096))
        self.statvfs.start()
        self.addCleanup(self.statvfs.stop)
        self.common = SimpleNamespace(sample=Mock(side_effect=sample))

    def plan(self, **extra):
        return R.admit_disk_plan(self.root, checkout_bytes=123456, binary_bytes=143299024, **extra)

    def test_full_retained_plan_charges_all_copies_recovery_and_unchanged_ram(self):
        plan = self.plan()
        self.assertEqual(plan['requiredAdditionalBytes'], sum(plan['budgets'].values()) + R.FREE_RESERVE_BYTES)
        for key in ('cipherParts15', 'cipherConcatenation', 'originalFiles12', 'stagedCheckout',
                    'stagedPinnedBinaries', 'cacheAndPrepare', 'readonlyMaterialization',
                    'postgresData', 'postgresWAL', 'renderedSQLContainer', 'renderedSQLPrivateReadback',
                    'finalDatabaseDumpAndRoles', 'completePrivateSelection', 'encryptedBackup',
                    'offhostCipherDownload', 'artifactTransportZipAllowance', 'authenticatedReadback',
                    'freshRecoveryPostgresData', 'freshRecoveryFinalDumpAndRoles'):
            self.assertGreater(plan['budgets'][key], 0)
        self.assertEqual((plan['commonMemoryLimitBytes'], plan['maximumActualCommonLifetimePeakBytes'],
                          plan['requiredMemoryReserveBytes'], plan['swapMaximumBytes']),
                         (2560000000, 2048000000, 512000000, 0))
        self.assertFalse(plan['executionAuthority'])
        self.assertFalse(plan['automaticDeletionAllowed'])

    def test_fresh_real_free_space_cannot_be_replaced_by_historical_plan(self):
        plan = self.plan()
        self.free = plan['requiredAdditionalBytes'] - 4096
        with self.assertRaisesRegex(R.ResourceRejected, 'FULL_DISK_PLAN_DOES_NOT_FIT'):
            self.plan()

    def test_unknown_and_noninteger_sizes_do_not_become_zero(self):
        for value in (None, True, -1, '123'):
            with self.subTest(value=value), self.assertRaises(R.ResourceRejected):
                R.admit_disk_plan(self.root, checkout_bytes=value, binary_bytes=100)

    def test_guard_reads_same_common_parent_and_retains_peak_without_deductions(self):
        guard = R.DiskGuard(self.root, self.plan(), self.common)
        self.assertEqual(guard()['commonKernelSample']['kernelLifetimePeakBytes'], 12345)
        self.common.sample.side_effect = lambda: {**sample(), 'kernelLifetimePeakBytes': 2048000001}
        with self.assertRaises(Exception):
            guard()
        self.assertGreaterEqual(self.common.sample.call_count, 3)

    def test_guard_detects_reserve_loss_and_actual_category_overflow(self):
        plan = self.plan()
        item = self.root / 'file'
        item.write_bytes(b'FICTIONAL')
        guard = R.DiskGuard(self.root, plan, self.common, paths={'privateLogsAndRuntimeState': [item]})
        self.assertEqual(guard()['measuredCategories'], {'privateLogsAndRuntimeState': 9})
        self.free = R.FREE_RESERVE_BYTES - 4096
        with self.assertRaises(R.ResourceRejected):
            guard()
        self.free = 32 * 1024 ** 3
        with item.open('wb') as stream:
            stream.truncate(plan['budgets']['privateLogsAndRuntimeState'] + 1)
        with self.assertRaisesRegex(R.ResourceRejected, 'CATEGORY_LIMIT'):
            guard()

    def test_guard_disallows_overlapping_measurement_and_expired_wall(self):
        parent = self.root / 'group'
        parent.mkdir()
        child = parent / 'child'
        child.write_bytes(b'fictional')
        with self.assertRaises(R.ResourceRejected):
            R.DiskGuard(self.root, self.plan(), self.common,
                        paths={'privateLogsAndRuntimeState': [parent, child]})
        guard = R.DiskGuard(self.root, self.plan(maximum_wall_seconds=300), self.common)
        with patch.object(R.time, 'monotonic', return_value=guard.started + 301):
            with self.assertRaisesRegex(R.ResourceRejected, 'WALL_DEADLINE'):
                guard()

    def test_ordinary_tree_does_not_follow_links_or_accept_shared_inode(self):
        root = self.root / 'tree'
        root.mkdir()
        first = root / 'first'
        first.write_bytes(b'fictional')
        self.assertEqual(R.tree_bytes(root), 9)
        os.link(first, root / 'second')
        with self.assertRaises(R.ResourceRejected):
            R.tree_bytes(root)

    def test_cost_is_published_bounded_storage_and_does_not_invent_free_quota(self):
        envelope = R.cost_envelope()
        self.assertEqual(envelope['artifactPublishedStorageUSDPerGBMonth'], '0.25')
        self.assertEqual(envelope['artifactMaximumStorageUSD'], '0.05')
        self.assertEqual(envelope['artifactRetentionDays'], 1)
        self.assertFalse(envelope['artifactQuotaAvailabilityAssumed'])
        self.assertEqual(envelope['modelCalls'], 0)


if __name__ == '__main__':
    unittest.main()
