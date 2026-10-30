"""Invented proc/cgroup fixtures only; no host/process/test execution."""
import sys
sys.dont_write_bytecode = True

import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('w15_memory_component_test', Path(__file__).with_name('memory_components.py'))
M = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)


class ComponentChecks(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='w15-fictional-memory-components-')
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.parent = self.root / ('w15_123456_' + 'a' * 32 + '.slice')
        self.parent.mkdir()
        self.proc = self.root / 'proc'; self.proc.mkdir()
        s = self.parent.stat(); self.identity = s.st_dev, s.st_ino
        for name, raw in {'memory.current': '2047098880', 'memory.peak': '2048073728',
                'memory.max': '2560000000', 'memory.swap.max': '0', 'memory.swap.current': '0',
                'memory.stat': 'anon 123456\nfile 67108864\nkernel 4096\nshmem 1024\nfile_dirty 0\nfile_writeback 0\n',
                'cgroup.procs': ''}.items():
            (self.parent / name).write_text(raw)
        self.bindings = []

    def process(self, pid, role=None, start=900, pss=60, rss=100, folder=None):
        base = self.parent if folder is None else self.parent / folder
        if not base.exists():
            base.mkdir(); (base / 'cgroup.procs').write_text('')
        with (base / 'cgroup.procs').open('a') as stream: stream.write(str(pid) + '\n')
        proc = self.proc / str(pid); proc.mkdir()
        (proc / 'stat').write_text(str(pid) + ' (FICTIONAL_PRIVATE_CANARY worker)) S ' + '0 ' * 18 + str(start) + ' 0 0\n')
        member = '/' + self.parent.name + (('/' + folder) if folder else '')
        (proc / 'cgroup').write_text('0::' + member + '\n')
        (proc / 'smaps_rollup').write_text('00000000-00000001 ---p [rollup]\nRss: '+str(rss)+' kB\nPss: '+str(pss)+' kB\nShared_Clean: 40 kB\n')
        if role is not None:
            self.bindings.append({'pid': pid, 'startTicks': start, 'role': role})
        return proc

    def observe(self, **kwargs):
        def opened(_): return os.open(self.parent, os.O_RDONLY | os.O_DIRECTORY)
        with patch.object(M.R, '_kernel_directory', side_effect=opened), patch.object(M, 'PROC_ROOT', self.proc):
            return M.observe(self.parent, kwargs.pop('identity', self.identity), kwargs.pop('bindings', self.bindings))

    def test_inert_plan_has_no_measurement_or_guard_effect(self):
        with patch.object(M.os, 'open', side_effect=AssertionError('NO_READ')):
            self.assertFalse(M.plan()['activePolling'])
            self.assertFalse(M.plan()['executionAuthority'])

    def test_pss_deduplicates_pids_shared_pages_and_separates_file_cache(self):
        self.process(101, 'postgresql')
        self.process(102, 'postgresql', folder='postgres.scope')
        self.process(103, 'helmut-node', pss=7)
        # Duplicate entries never turn the same process into additional RAM.
        with (self.parent / 'cgroup.procs').open('a') as stream: stream.write('101\n102\n')
        result = self.observe()
        self.assertEqual(result['uniqueObservedPids'], 3)
        self.assertEqual(result['roles']['postgresql']['completeComponentPSSBytes'], 120 * 1024)
        self.assertEqual(result['roles']['helmut-node']['completeComponentPSSBytes'], 7 * 1024)
        self.assertNotEqual(result['roles']['postgresql']['observedPSSBytes'], 2 * 100 * 1024)
        self.assertEqual(result['common']['file'], 67108864)
        self.assertEqual(result['common']['kernelLifetimePeakBytes'], 2048073728)
        self.assertFalse(result['fileCacheAdditiveToPSS'])
        self.assertFalse(result['peakCompositionKnown'])
        self.assertFalse(result['resourceGuardAccepted'])
        self.assertEqual(result['vercelActualMemoryBytes'], 'UNKNOWN')
        self.assertNotIn('FICTIONAL_PRIVATE_CANARY', json.dumps(result))

    def test_ambiguous_node_or_same_pid_application_and_controller_stay_unknown(self):
        self.process(101, pss=20)
        result = self.observe()
        self.assertFalse(result['allObservedProcessesBound'])
        self.assertEqual(result['roles']['unknown']['observedPSSBytes'], 20 * 1024)
        self.assertEqual(result['roles']['helmut-node']['completeComponentPSSBytes'], 'UNKNOWN')
        self.assertEqual(result['roles']['helmut-node']['observedPSSBytes'], 'UNKNOWN')
        unresolved = self.observe(bindings=[{'pid': 101, 'startTicks': 900, 'role': 'unknown'}])
        self.assertFalse(unresolved['allObservedProcessesBound'])
        self.assertEqual(unresolved['roles']['unknown']['observedPSSBytes'], 20 * 1024)
        self.assertEqual(unresolved['roles']['helmut-node']['completeComponentPSSBytes'], 'UNKNOWN')
        bindings = [{'pid': 101, 'startTicks': 900, 'role': 'helmut-node'},
                    {'pid': 101, 'startTicks': 900, 'role': 'controller-helpers'}]
        collision = self.observe(bindings=bindings)
        self.assertEqual(collision['roleBindingCollisions'], 1)
        self.assertEqual(collision['roles']['unknown']['observedPSSBytes'], 'UNKNOWN')
        self.assertEqual(collision['roles']['helmut-node']['completeComponentPSSBytes'], 'UNKNOWN')

    def test_unreadable_process_is_unknown_without_permission_changes(self):
        bad = self.process(101, 'postgresql')
        self.process(102, 'helmut-node', pss=7)
        (bad / 'smaps_rollup').unlink()
        result = self.observe()
        self.assertEqual(result['status'], 'PARTIAL_OPTIONAL_MEMORY_DIAGNOSTIC')
        self.assertEqual(result['roles']['postgresql']['completeComponentPSSBytes'], 'UNKNOWN')
        self.assertEqual(result['roles']['helmut-node']['observedPSSBytes'], 7 * 1024)
        self.assertEqual(result['common']['currentBytes'], 2047098880)

    def test_missing_declared_pid_is_unknown_but_verified_empty_parent_without_claims_is_zero(self):
        empty = self.observe()
        self.assertTrue(empty['allDeclaredProcessesObserved'])
        self.assertEqual(empty['roles']['postgresql']['completeComponentPSSBytes'], 0)
        self.process(101, 'helmut-node', pss=7)
        bindings = [*self.bindings, {'pid': 999, 'startTicks': 800, 'role': 'postgresql'}]
        missing = self.observe(bindings=bindings)
        self.assertFalse(missing['allDeclaredProcessesObserved'])
        self.assertEqual(missing['status'], 'PARTIAL_OPTIONAL_MEMORY_DIAGNOSTIC')
        self.assertEqual(missing['roles']['postgresql']['completeComponentPSSBytes'], 'UNKNOWN')
        self.assertEqual(missing['roles']['postgresql']['observedPSSBytes'], 'UNKNOWN')
        self.assertEqual(missing['roles']['helmut-node']['observedPSSBytes'], 7 * 1024)

    def test_pid_reuse_or_membership_change_never_keeps_old_role_assignment(self):
        proc = self.process(101, 'helmut-node')
        wrong = [{**self.bindings[0], 'startTicks': 899}]
        result = self.observe(bindings=wrong)
        self.assertEqual(result['roles']['helmut-node']['completeComponentPSSBytes'], 'UNKNOWN')
        self.assertEqual(result['roles']['unknown']['observedPSSBytes'], 'UNKNOWN')
        (proc / 'cgroup').write_text('0::/some-other-parent\n')
        moved = self.observe()
        self.assertEqual(moved['roles']['unknown']['observedPSSBytes'], 'UNKNOWN')

    def test_change_during_pss_or_after_readback_stays_unknown(self):
        proc = self.process(101, 'helmut-node')
        original = M._identity
        calls = 0
        def replaced(fd, parent):
            nonlocal calls
            calls += 1
            start, group = original(fd, parent)
            return (start + 1 if calls >= 2 else start), group
        with patch.object(M, '_identity', side_effect=replaced):
            result = self.observe()
        self.assertEqual(result['roles']['helmut-node']['completeComponentPSSBytes'], 'UNKNOWN')
        (proc / 'smaps_rollup').write_text('Pss: 1 kB\n')
        with patch.object(M, '_inventory', side_effect=[{101}, {101, 102}]):
            unstable = self.observe()
        self.assertFalse(unstable['pidInventoryStable'])
        self.assertTrue(all(row['completeComponentPSSBytes'] == 'UNKNOWN' for row in unstable['roles'].values()))

    def test_missing_and_malformed_counters_are_unknown_not_zero(self):
        self.process(101, 'postgrest')
        (self.parent / 'memory.current').unlink()
        (self.parent / 'memory.stat').write_text('file 7\n')
        result = self.observe()
        self.assertEqual(result['common']['currentBytes'], 'UNKNOWN')
        self.assertEqual(result['common']['file'], 7)
        self.assertEqual(result['common']['anon'], 'UNKNOWN')
        (self.parent / 'memory.stat').write_text('file 7\nfile 9\n')
        bad = self.observe()
        self.assertTrue(all(bad['common'][key] == 'UNKNOWN' for key in M.STAT_FIELDS))

    def test_identity_oversize_symlink_and_pid_boundaries_fail_closed(self):
        proc = self.process(101, 'backup')
        self.assertEqual(self.observe(identity=(0, 0))['status'], 'UNKNOWN_OPTIONAL_MEMORY_DIAGNOSTIC')
        (proc / 'smaps_rollup').write_bytes(b'x' * (M.MAX_BYTES + 1))
        self.assertEqual(self.observe()['roles']['backup']['observedPSSBytes'], 'UNKNOWN')
        (proc / 'smaps_rollup').unlink()
        (proc / 'smaps_rollup').symlink_to(self.parent / 'memory.current')
        self.assertEqual(self.observe()['roles']['backup']['observedPSSBytes'], 'UNKNOWN')
        with patch.object(M, 'MAX_PIDS', 0):
            self.assertEqual(self.observe()['status'], 'UNKNOWN_OPTIONAL_MEMORY_DIAGNOSTIC')

    def test_all_actual_opens_are_read_only_and_no_private_process_files_are_read(self):
        self.process(101, 'controller-helpers')
        real_open, opened = os.open, []
        def traced(path, flags, *args, **kwargs):
            opened.append((str(path), flags))
            return real_open(path, flags, *args, **kwargs)
        before = M.R.LIMIT, M.R.MAXIMUM, M.R.RESERVE
        with patch.object(M.os, 'open', side_effect=traced):
            result = self.observe()
        self.assertTrue(result['sameParentIdentityObserved'])
        self.assertTrue(all(flags & (os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_TRUNC) == 0 for _, flags in opened))
        self.assertFalse(any(name in ('cmdline', 'environ', 'comm') for name, _ in opened))
        self.assertEqual((M.R.LIMIT, M.R.MAXIMUM, M.R.RESERVE), before)


if __name__ == '__main__':
    unittest.main()
