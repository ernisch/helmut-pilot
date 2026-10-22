#!/usr/bin/env python3
"""Pure temporary-file pressure cases; no Docker, engine, DB or provider."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('pressure_meter', Path(__file__).with_name('kernel-meter.py'))
M = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)
PARENT = 'helmut-meter-pressure-test-only'


class PressureSnapshots(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='helmut-pressure-pure-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.group = self.root / PARENT
        self.group.mkdir()
        self.start_patch(patch.object(M, 'CGROUP_ROOT', self.root))
        self.start_patch(patch.object(M.subprocess, 'run', side_effect=AssertionError('subprocess forbidden')))
        self.write_sources()

    def start_patch(self, item):
        value = item.start()
        self.addCleanup(item.stop)
        return value

    def write_sources(self, offset=0):
        for name in ('memory.pressure', 'io.pressure'):
            (self.group / name).write_text(
                f'some avg10=0.00 avg60=1.25 avg300=2.00 total={100 + offset}\n'
                f'full avg10=0.00 avg60=0.00 avg300=0.00 total={50 + offset}\n')
        (self.group / 'memory.stat').write_text(
            ''.join(f'{key} {1000 + index + offset}\n' for index, key in enumerate(M.RECLAIM_COUNTERS))
            + 'anon 2048\n')

    def pair(self):
        with patch.object(M.time, 'monotonic_ns', side_effect=[100, 110, 130, 150]):
            before = M.pressure_snapshot(PARENT)
            self.write_sources(5)
            after = M.pressure_snapshot(PARENT)
        return before, after

    def assert_no_deltas(self, result, reason=None):
        self.assertEqual(result['status'], 'UNKNOWN')
        if reason:
            self.assertEqual(result['reason'], reason)
        self.assertIsNone(result['intervalMinimumNS'])
        self.assertIsNone(result['intervalMaximumNS'])
        self.assertTrue(all(value is None for counters in result['counterDeltas'].values()
                            for value in counters.values()))
        self.assertNotIn('pass', result)
        self.assertTrue(result['notUnit60OrReserveEvidence'])

    def test_legacy_snapshot_has_identical_fields_and_no_pressure_reads(self):
        files = {'cgroup.events': 'populated 0\n', 'cgroup.procs': '', 'memory.peak': '900',
                 'memory.current': '0', 'memory.events': 'high 3\noom_kill 0\n',
                 'cpu.stat': 'usage_usec 15\n', 'io.stat': '8:0 rbytes=1 wbytes=2\n'}
        for name, text in files.items():
            (self.group / name).write_text(text)
        with patch.object(M, '_pressure_file', side_effect=AssertionError('default requested pressure')):
            result = M.kernel_snapshot(PARENT, require_empty=True)
        self.assertEqual(result, {
            'parent': PARENT, 'memoryPeakBytes': 900, 'memoryCurrentBytes': 0,
            'memoryEvents': {'high': 3, 'oom_kill': 0}, 'cpu': {'usage_usec': 15},
            'events': {'populated': 0}, 'populatedSubgroups': [],
            'ioStatRawNumericOnly': '8:0 rbytes=1 wbytes=2', 'fullLastProcessExitCovered': True,
            'scope': 'All descendants charged to dedicated kernel group; no RSS polling substitution'})

    def test_complete_numeric_snapshot_has_measured_cost_bracket(self):
        with patch.object(M.time, 'monotonic_ns', side_effect=[100, 145]):
            result = M.pressure_snapshot(PARENT)
        self.assertEqual(result['schema'], M.PRESSURE_SCHEMA)
        self.assertEqual(result['status'], 'OBSERVED')
        self.assertEqual(result['observationElapsedNS'], 45)
        self.assertEqual(result['sources']['memory']['counters'], {'someTotalUsec': 100, 'fullTotalUsec': 50})
        self.assertEqual(result['groupIdentity']['inode'], self.group.stat().st_ino)
        self.assertFalse(result['snapshotsAtomic'])
        self.assertTrue(result['observationOverheadIncluded'])
        self.assertFalse(result['reportSerializationIncluded'])
        self.assertEqual(json.loads(json.dumps(result)), result)
        self.assertNotIn('pass', result)

    def test_observed_zero_is_distinct_from_unknown(self):
        for name in ('memory.pressure', 'io.pressure'):
            (self.group / name).write_text('some avg10=0.00 avg60=0.00 avg300=0.00 total=0\n'
                                           'full avg10=0.00 avg60=0.00 avg300=0.00 total=0\n')
        result = M.pressure_snapshot(PARENT)
        self.assertEqual(result['status'], 'OBSERVED')
        self.assertEqual(result['sources']['memory']['counters']['someTotalUsec'], 0)
        self.assertTrue(result['notUnit60OrReserveEvidence'])

    def test_snapshot_clock_regression_is_unknown(self):
        with patch.object(M.time, 'monotonic_ns', side_effect=[150, 100]):
            result = M.pressure_snapshot(PARENT)
        self.assertEqual(result['status'], 'UNKNOWN')
        self.assertIsNone(result['observationElapsedNS'])
        self.assertTrue(all(source['reason'] == 'CLOCK_REGRESSION' for source in result['sources'].values()))

    def test_missing_file_is_explicit_unknown(self):
        (self.group / 'memory.pressure').unlink()
        result = M.pressure_snapshot(PARENT)
        self.assertEqual(result['status'], 'UNKNOWN')
        self.assertEqual(result['sources']['memory'], M._pressure_source('memory', 'MISSING_FILE'))
        self.assertEqual(result['sources']['io']['status'], 'OBSERVED')

    def test_missing_selected_reclaim_counter_keeps_null_and_known_values(self):
        target = self.group / 'memory.stat'
        target.write_text(target.read_text().replace('pgscan 1000\n', ''))
        result = M.pressure_snapshot(PARENT)
        self.assertEqual(result['status'], 'UNKNOWN')
        self.assertIsNone(result['sources']['reclaim']['counters']['pgscan'])
        self.assertEqual(result['sources']['reclaim']['counters']['pgsteal'], 1001)
        self.assertEqual(result['sources']['reclaim']['reason'], 'MISSING_COUNTER')

    def test_missing_full_psi_row_is_unknown_without_discarding_some(self):
        (self.group / 'io.pressure').write_text('some avg10=0.00 avg60=0.00 avg300=0.00 total=12\n')
        source = M.pressure_snapshot(PARENT)['sources']['io']
        self.assertEqual(source['status'], 'UNKNOWN')
        self.assertEqual(source['counters']['someTotalUsec'], 12)
        self.assertIsNone(source['counters']['fullTotalUsec'])

    def test_malformed_and_duplicate_psi_rows_are_never_zero(self):
        original = (self.group / 'memory.pressure').read_text()
        malformed = ['', original + original.splitlines()[0] + '\n',
                     original.replace('total=100', 'total=-1'),
                     original.replace('total=100', f'total={2**64}'),
                     original.replace('avg10=0.00', 'avg10=101.00'),
                     original.replace('avg60=1.25', 'avg60=NaN'), original + 'unexpected 0\n']
        for text in malformed:
            with self.subTest(text=text[:80]):
                (self.group / 'memory.pressure').write_text(text)
                source = M.pressure_snapshot(PARENT)['sources']['memory']
                self.assertEqual(source, M._pressure_source('memory', 'MALFORMED_COUNTERS'))

    def test_malformed_reclaim_files_are_unknown(self):
        original = (self.group / 'memory.stat').read_text()
        for text in ('', original + 'pgscan 1\n', original.replace('pgscan 1000', 'pgscan -1'),
                     original.replace('pgscan 1000', f'pgscan {2**64}'), original + 'not a counter\n'):
            with self.subTest(text=text[:80]):
                (self.group / 'memory.stat').write_text(text)
                source = M.pressure_snapshot(PARENT)['sources']['reclaim']
                self.assertEqual(source, M._pressure_source('reclaim', 'MALFORMED_COUNTERS'))

    def test_read_cap_never_consumes_unbounded_metadata(self):
        (self.group / 'memory.pressure').write_bytes(b'X' * (M.PRESSURE_READ_LIMIT * 3))
        original_read = M.os.read
        counts = []
        def read(fd, count):
            counts.append(count)
            self.assertLessEqual(count, 4096)
            return original_read(fd, count)
        with patch.object(M.os, 'read', side_effect=read):
            source = M.pressure_snapshot(PARENT)['sources']['memory']
        self.assertEqual(source, M._pressure_source('memory', 'READ_LIMIT_EXCEEDED'))
        self.assertIn(1, counts)

    def test_denied_or_failed_read_is_unknown(self):
        original_open = M.os.open
        for exception, reason in ((PermissionError, 'ACCESS_DENIED'), (OSError, 'READ_ERROR')):
            def opened(file, flags, **kwargs):
                if file == 'memory.pressure':
                    raise exception('synthetic metadata read failure')
                return original_open(file, flags, **kwargs)
            with self.subTest(reason=reason), patch.object(M.os, 'open', side_effect=opened):
                source = M.pressure_snapshot(PARENT)['sources']['memory']
            self.assertEqual(source, M._pressure_source('memory', reason))

    def test_invalid_encoding_is_unknown(self):
        (self.group / 'memory.pressure').write_bytes(b'\xff')
        self.assertEqual(M.pressure_snapshot(PARENT)['sources']['memory'],
                         M._pressure_source('memory', 'INVALID_ENCODING'))

    def test_symlink_and_fifo_are_not_followed_or_read(self):
        target = self.group / 'memory.pressure'
        target.unlink()
        target.symlink_to(self.group / 'io.pressure')
        self.assertEqual(M.pressure_snapshot(PARENT)['sources']['memory']['status'], 'UNKNOWN')
        target.unlink()
        os.mkfifo(target)
        self.assertEqual(M.pressure_snapshot(PARENT)['sources']['memory'],
                         M._pressure_source('memory', 'NOT_REGULAR'))

    def test_missing_group_and_changed_group_are_unknown(self):
        result = M.pressure_snapshot(PARENT + '-missing')
        self.assertIsNone(result['groupIdentity'])
        self.assertEqual(result['status'], 'UNKNOWN')
        original = M._pressure_file
        def replace(directory_fd, name):
            text, reason = original(directory_fd, name)
            if name == 'memory.stat':
                self.group.rename(self.root / 'preserved-old-group')
                self.group.mkdir()
            return text, reason
        with patch.object(M, '_pressure_file', side_effect=replace):
            result = M.pressure_snapshot(PARENT)
        self.assertIsNone(result['groupIdentity'])
        self.assertTrue(all(source['status'] == 'UNKNOWN' for source in result['sources'].values()))

    def test_parent_syntax_is_still_restricted(self):
        for name in ('../foreign', '/sys/fs/cgroup', 'helmut-meter-short/../../foreign'):
            with self.subTest(name=name), self.assertRaises(ValueError):
                M.pressure_snapshot(name)

    def test_valid_delta_has_interval_bounds_and_exposes_observation_cost(self):
        before, after = self.pair()
        result = M.pressure_delta(before, after)
        self.assertEqual(result['status'], 'OBSERVED')
        self.assertIsNone(result['reason'])
        self.assertEqual((result['intervalMinimumNS'], result['intervalMaximumNS']), (20, 50))
        self.assertTrue(all(value == 5 for counters in result['counterDeltas'].values() for value in counters.values()))
        self.assertNotIn('pass', result)
        self.assertTrue(result['observationOverheadIncluded'])

    def test_equal_counters_mean_observed_zero_without_acceptance(self):
        before, after = self.pair()
        after['sources'] = copy.deepcopy(before['sources'])
        result = M.pressure_delta(before, after)
        self.assertEqual(result['status'], 'OBSERVED')
        self.assertTrue(all(value == 0 for counters in result['counterDeltas'].values() for value in counters.values()))
        self.assertTrue(result['notUnit60OrReserveEvidence'])

    def test_every_selected_counter_reset_invalidates_all_deltas(self):
        before, after = self.pair()
        for kind, source in before['sources'].items():
            for counter, value in source['counters'].items():
                with self.subTest(kind=kind, counter=counter):
                    changed = copy.deepcopy(after)
                    changed['sources'][kind]['counters'][counter] = value - 1
                    self.assert_no_deltas(M.pressure_delta(before, changed), 'COUNTER_RESET')

    def test_unknown_old_or_partial_snapshots_cannot_produce_deltas(self):
        before, after = self.pair()
        bad = [None, {}, {'memoryPeakBytes': 1}, {**before, 'schema': 'historical-no-pressure/1'},
               {**before, 'status': 'UNKNOWN'}, {**before, 'groupIdentity': None}]
        for sample in bad:
            with self.subTest(sample=sample):
                self.assert_no_deltas(M.pressure_delta(sample, after))
                self.assert_no_deltas(M.pressure_delta(before, sample))

    def test_schema_types_and_counter_shapes_are_validated(self):
        before, after = self.pair()
        changes = [('monotonicBeginNS', True), ('observationElapsedNS', -1), ('snapshotsAtomic', True),
                   ('reportSerializationIncluded', True), ('notUnit60OrReserveEvidence', False),
                   ('observerIdentity', {'pid': True, 'nonce': 'a' * 32}),
                   ('groupIdentity', {'device': 0, 'inode': 0}), ('sources', [])]
        for key, value in changes:
            with self.subTest(key=key):
                self.assert_no_deltas(M.pressure_delta(before, {**after, key: value}))
        for value in (None, True, -1, 2**64, '5'):
            with self.subTest(counter=value):
                changed = copy.deepcopy(after)
                changed['sources']['memory']['counters']['someTotalUsec'] = value
                self.assert_no_deltas(M.pressure_delta(before, changed))
        changed = copy.deepcopy(after)
        changed['sources']['memory']['counters']['unexpected'] = 0
        self.assert_no_deltas(M.pressure_delta(before, changed))

    def test_group_and_observer_changes_invalidate_deltas(self):
        before, after = self.pair()
        for key, value, reason in (
                ('parent', PARENT + '-other', 'GROUP_IDENTITY_CHANGED'),
                ('groupIdentity', {'device': 0, 'inode': 1}, 'GROUP_IDENTITY_CHANGED'),
                ('observerIdentity', {'pid': 1, 'nonce': 'a' * 32}, 'CLOCK_DOMAIN_CHANGED')):
            with self.subTest(key=key):
                self.assert_no_deltas(M.pressure_delta(before, {**after, key: value}), reason)

    def test_clock_regression_overlap_or_invalid_brackets_invalidate_deltas(self):
        before, after = self.pair()
        for begin, end in ((90, 95), (105, 125), (150, 130)):
            with self.subTest(begin=begin, end=end):
                changed = {**after, 'monotonicBeginNS': begin, 'monotonicEndNS': end,
                           'observationElapsedNS': end - begin}
                self.assert_no_deltas(M.pressure_delta(before, changed))
        self.assert_no_deltas(M.pressure_delta(before, {**after, 'observationElapsedNS': 0}))


if __name__ == '__main__':
    unittest.main()
