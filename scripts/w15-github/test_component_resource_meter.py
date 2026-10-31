"""Invented cgroup/proc files only; no live kernel, DB, Docker or network."""
import sys
sys.dont_write_bytecode = True

import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('w15_resource_meter_test', Path(__file__).with_name('component_resource_meter.py'))
C = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(C)


class ResourceMeterChecks(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory(prefix='w15-fictional-component-resource-')
        self.addCleanup(tmp.cleanup); self.root = Path(tmp.name)
        self.parent = self.root / ('w15_123456_' + 'a' * 32 + '.slice'); self.parent.mkdir()
        (self.parent / 'cgroup.procs').write_text('')
        self.proc = self.root / 'proc'; self.proc.mkdir()
        self.identity = self.ident(self.parent); self.rows = []
        self.meter = C.Meter()

    @staticmethod
    def ident(path):
        s = path.stat(); return s.st_dev, s.st_ino

    @staticmethod
    def cpu(path, usage=1000000, user=600000, system=400000, periods=10, throttled=2, throttle=40000):
        (path / 'cpu.stat').write_text(''.join(k + ' ' + str(v) + '\n' for k, v in zip(C.CPU_FIELDS,
            (usage, user, system, periods, throttled, throttle))))

    def group(self, role='application', instance=1, pid=101, name='FICTIONAL_PRIVATE_GROUP', start=900):
        path = self.parent / name; path.mkdir()
        for key, raw in {'cgroup.procs': str(pid) + '\n', 'memory.current': '123456', 'memory.peak': '200000',
            'memory.max': '300000', 'memory.swap.current': '0', 'memory.swap.max': '0',
            'memory.events': 'low 0\nhigh 0\nmax 0\noom 0\noom_kill 0\noom_group_kill 0\n',
            'memory.stat': 'anon 70000\nfile 50000\nkernel 3456\nshmem 100\nfile_dirty 10\nfile_writeback 0\n',
            'cpu.max': '100000 100000', 'cpuset.cpus.effective': '0-2,4',
            'memory.pressure': 'some avg10=0.00 avg60=0.01 avg300=0.02 total=123\nfull avg10=0.00 avg60=0.00 avg300=0.00 total=0\n',
            'cpu.pressure': 'some avg10=1.00 avg60=2.00 avg300=3.00 total=456\nfull avg10=0.00 avg60=0.00 avg300=0.00 total=0\n'}.items():
            (path / key).write_text(raw)
        self.cpu(path)
        proc = self.proc / str(pid); proc.mkdir(exist_ok=True)
        (proc / 'stat').write_text(str(pid) + ' (DO_NOT_EXPORT_PRIVATE_COMM)) S ' + '0 ' * 18 + str(start) + ' 0\n')
        (proc / 'cgroup').write_text('0::/' + str(path.relative_to(self.root)) + '\n')
        row = {'role': role, 'instanceId': instance if role == 'application' else 0,
            'absolutePath': path, 'identity': self.ident(path),
            'processBindings': [{'pid': pid, 'startTicks': start, 'role': role}]}
        self.rows.append(row)
        return path, row

    def observe(self, rows=None, identity=None):
        def opened(path):
            self.assertEqual(path, self.parent)
            return os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        with patch.object(C.R, '_kernel_directory', side_effect=opened), patch.object(C.R, 'KERNEL_ROOT', self.root), \
             patch.object(C.M, 'PROC_ROOT', self.proc):
            return self.meter.observe(self.parent, self.identity if identity is None else identity,
                                      self.rows if rows is None else rows)

    def test_separate_instances_raw_memory_cpu_and_no_authority_or_additive_peaks(self):
        self.group()
        self.group(instance=2, pid=102, name='app2')
        self.group('database', pid=103, name='db')
        self.group('test-tools', pid=104, name='tools')
        self.group('backup', pid=105, name='backup')
        value = self.observe(); rows = value['groups']
        self.assertEqual(value['status'], 'OBSERVED_SEPARATE_CGROUP_COUNTERS_ONLY')
        self.assertEqual([r['instanceId'] for r in rows[:2]], [1, 2])
        self.assertEqual(rows[0]['observedKernel']['memory']['kernelLifetimePeakBytes'], 200000)
        self.assertEqual(rows[0]['observedKernel']['memoryStat']['file'], 50000)
        self.assertEqual(rows[0]['observedKernel']['cpuMaximum'], {'quotaUsec': 100000, 'periodUsec': 100000})
        self.assertEqual(rows[0]['observedKernel']['effectiveCpuset'], '0-2,4')
        self.assertEqual(rows[0]['observedKernel']['cpuPressure']['some']['avg10'], 100)
        self.assertEqual(rows[0]['cpuInterval']['usageLogicalCPUs'], 'UNKNOWN')
        self.assertFalse(value['fileCacheAdditiveToPSS']); self.assertFalse(value['differentPeaksAdditive'])
        self.assertFalse(value['executionAuthority']); self.assertFalse(value['resourceContractAccepted'])
        self.assertFalse(value['activePolling']); self.assertEqual(value['wholeSupabaseMicroConsumption'], 'UNKNOWN')
        self.assertEqual(value['vercelActualConsumption'], 'UNKNOWN')
        self.assertNotIn('FICTIONAL_PRIVATE_GROUP', json.dumps(value))
        self.assertNotIn('DO_NOT_EXPORT', json.dumps(value)); self.assertNotIn(str(self.root), json.dumps(value))

    def test_cpu_intervals_need_stable_identity_time_and_monotone_counters(self):
        path, _ = self.group()
        with patch.object(C.time, 'monotonic_ns', side_effect=[1000000000, 2000000000]):
            self.assertEqual(self.observe()['groups'][0]['cpuInterval']['elapsedNS'], 'UNKNOWN')
            self.cpu(path, usage=1500000, user=900000, system=600000, periods=20, throttled=3, throttle=50000)
            interval = self.observe()['groups'][0]['cpuInterval']
        self.assertEqual(interval['elapsedNS'], 1000000000)
        self.assertEqual(interval['usageLogicalCPUs'], 0.5)
        self.assertEqual(interval['counterDeltas']['throttled_usec'], 10000)
        self.assertEqual(interval['counterIdentityDrift'], 'NONE_OBSERVED')
        self.assertTrue(interval['kernelLifetimePeakMonotonic'])

    def test_counter_regression_is_detected_and_latched_without_resetting_kernel(self):
        path, _ = self.group(); self.observe()
        self.cpu(path, usage=999999)
        interval = self.observe()['groups'][0]['cpuInterval']
        self.assertEqual(interval['counterIdentityDrift'], 'COUNTER_DECREASED')
        self.assertEqual(interval['usageLogicalCPUs'], 'UNKNOWN')
        self.cpu(path, usage=2000000)
        self.assertEqual(self.observe()['groups'][0]['cpuInterval']['usageLogicalCPUs'], 'UNKNOWN')
        self.assertEqual((path / 'memory.peak').read_text(), '200000')

    def test_group_replacement_invalidates_previous_cpu_interval(self):
        path, _ = self.group(); self.observe()
        path.rename(self.root / 'retired_owned_fixture')
        self.rows = []; self.group()
        interval = self.observe()['groups'][0]['cpuInterval']
        self.assertEqual(interval['counterIdentityDrift'], 'IDENTITY_CHANGED')
        self.assertEqual(interval['counterDeltas'], 'UNKNOWN')
        self.assertEqual(self.observe(identity=(0, 0))['groups'], [])

    def test_missing_values_unlimited_and_partial_assignment_are_truthful(self):
        path, row = self.group(); row['processBindings'] = []
        (path / 'memory.current').unlink(); (path / 'cpu.pressure').unlink()
        (path / 'memory.max').write_text('max'); (path / 'cpu.max').write_text('max 100000')
        value = self.observe(); group = value['groups'][0]
        self.assertEqual(group['classifiedRole'], 'UNKNOWN')
        self.assertEqual(group['observedKernel']['memory']['currentBytes'], 'UNKNOWN')
        self.assertEqual(group['observedKernel']['memory']['kernelLifetimePeakBytes'], 200000)
        self.assertEqual(group['observedKernel']['memory']['maximumBytes'], 'UNLIMITED')
        self.assertEqual(group['observedKernel']['cpuMaximum']['quotaUsec'], 'UNLIMITED')
        self.assertEqual(group['observedKernel']['cpuPressure'], 'UNKNOWN')

    def test_same_pid_application_and_driver_cannot_be_pure_application(self):
        _, row = self.group()
        row['processBindings'].append({'pid': 101, 'startTicks': 900, 'role': 'test-tools'})
        group = self.observe()['groups'][0]
        self.assertEqual(group['classifiedRole'], 'UNKNOWN')
        self.assertEqual(group['assignment'], 'UNKNOWN')
        self.assertEqual(group['observedKernel']['memory']['currentBytes'], 123456)
        self.assertEqual(self.observe(rows=[])['status'], 'UNKNOWN_COMPONENT_RESOURCE_OBSERVATION')

    def test_parent_ancestor_alias_outside_and_symlink_groups_are_rejected(self):
        path, row = self.group()
        cases = [{**row, 'absolutePath': self.parent, 'identity': self.identity},
                 {**row, 'absolutePath': self.root / 'elsewhere'}]
        for bad in cases:
            with self.subTest(path='closed invalid input'):
                self.assertEqual(self.observe(rows=[bad])['groups'], [])
        alias = {**row, 'role': 'database', 'instanceId': 0}
        self.assertEqual(self.observe(rows=[row, alias])['groups'], [])
        child = path / 'nested'; child.mkdir(); (child / 'cgroup.procs').write_text('')
        self.assertEqual(self.observe(rows=[row, {**alias, 'absolutePath': child, 'identity': self.ident(child)}])['groups'], [])
        linked = self.parent / 'linked'; linked.symlink_to(path, target_is_directory=True)
        self.assertEqual(self.observe(rows=[{**row, 'absolutePath': linked}])['groups'], [])

    def test_pid_reuse_and_late_migration_retain_raw_counters_but_not_classification(self):
        self.group(); actual = C.M._identity; calls = 0
        def reused(fd, parent):
            nonlocal calls
            calls += 1; start, group = actual(fd, parent)
            return start + (1 if calls >= 2 else 0), group
        with patch.object(C.M, '_identity', side_effect=reused):
            row = self.observe()['groups'][0]
        self.assertEqual(row['classifiedRole'], 'UNKNOWN')
        self.assertFalse(row['pidInventoryStable'])
        self.assertEqual(row['observedKernel']['memory']['currentBytes'], 123456)
        self.assertEqual(row['cpuInterval']['counterDeltas'], 'UNKNOWN')
        calls = 0
        def late_reuse(fd, parent):
            nonlocal calls
            calls += 1; start, group = actual(fd, parent)
            return start + (1 if calls >= 3 else 0), group
        with patch.object(C.M, '_identity', side_effect=late_reuse):
            late = self.observe()['groups'][0]
        self.assertEqual(late['classifiedRole'], 'UNKNOWN')
        self.assertFalse(late['pidInventoryStable'])
        self.assertEqual(late['observedKernel']['memory']['currentBytes'], 123456)

    def test_cross_group_pid_collision_and_parser_bounds_never_claim_components(self):
        self.group(); self.group('database', pid=101, name='db')
        self.assertEqual(self.observe()['groups'], [])
        self.assertEqual(self.observe(rows=[self.rows[0]] * (C.MAX_GROUPS + 1))['groups'], [])
        many = {**self.rows[0], 'processBindings': [self.rows[0]['processBindings'][0]] * (C.MAX_BINDINGS + 1)}
        self.assertEqual(self.observe(rows=[many])['groups'], [])

    def test_missing_duplicate_oversize_and_symlink_counter_values_are_unknown(self):
        path, _ = self.group()
        (path / 'cpu.stat').write_text('usage_usec 1\nusage_usec 2\n')
        (path / 'memory.stat').write_text('anon 1\nanon 2\n')
        (path / 'cpu.max').write_text('123 0')
        (path / 'memory.current').unlink()
        row = self.observe()['groups'][0]['observedKernel']
        self.assertTrue(all(v == 'UNKNOWN' for v in row['cpuStat'].values()))
        self.assertTrue(all(v == 'UNKNOWN' for v in row['memoryStat'].values()))
        self.assertEqual(row['memory']['currentBytes'], 'UNKNOWN')
        self.assertEqual(row['cpuMaximum']['periodUsec'], 'UNKNOWN')
        (path / 'memory.events').write_bytes(b'x' * (C.M.MAX_BYTES + 1))
        self.assertTrue(all(v == 'UNKNOWN' for v in self.observe()['groups'][0]['observedKernel']['memoryEvents'].values()))
        (path / 'memory.current').symlink_to(path / 'memory.peak')
        self.assertEqual(self.observe()['groups'], [])

    def test_all_reads_are_passive_and_never_inspect_private_process_state(self):
        self.group(); actual = os.open; opened = []
        def record(path, flags, *args, **kwargs):
            opened.append((str(path), flags)); return actual(path, flags, *args, **kwargs)
        with patch.object(C.os, 'open', side_effect=record): value = self.observe()
        self.assertEqual(len(value['groups']), 1)
        self.assertTrue(all(flags & (os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_TRUNC) == 0 for _, flags in opened))
        self.assertFalse(any(name in ('cmdline', 'environ', 'comm', 'smaps_rollup') for name, _ in opened))
        self.assertLessEqual(len(json.dumps(value).encode()), C.MAX_OUTPUT_BYTES)

    def test_maximum_declared_groups_and_safe_numeric_output_are_bounded(self):
        for index in range(C.MAX_GROUPS):
            path, _ = self.group(instance=index + 1, pid=201 + index, name='fixture' + str(index))
            for name in ('memory.current', 'memory.peak', 'memory.max', 'memory.swap.max', 'memory.swap.current'):
                (path / name).write_text(str(C.M.MAX_NUMBER))
            (path / 'cpu.stat').write_text(''.join(k + ' ' + str(C.M.MAX_NUMBER) + '\n' for k in C.CPU_FIELDS))
            (path / 'cpu.max').write_text(str(C.M.MAX_NUMBER) + ' ' + str(C.M.MAX_NUMBER))
            (path / 'memory.events').write_text(''.join(k + ' ' + str(C.M.MAX_NUMBER) + '\n' for k in C.EVENTS))
            (path / 'memory.stat').write_text(''.join(k + ' ' + str(C.M.MAX_NUMBER) + '\n' for k in C.M.STAT_FIELDS))
        value = self.observe()
        self.assertEqual(len(value['groups']), C.MAX_GROUPS)
        self.assertLessEqual(len(json.dumps(value, separators=(',', ':')).encode()), C.MAX_OUTPUT_BYTES)
        self.assertTrue(all(row['cpuInterval']['usageLogicalCPUs'] == 'UNKNOWN' for row in value['groups']))
        self.assertFalse(value['resourceContractAccepted'])


if __name__ == '__main__': unittest.main()
