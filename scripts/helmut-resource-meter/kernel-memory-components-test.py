#!/usr/bin/env python3
"""Temporary-file components and retention checks; no live cgroup or subprocess."""
import ast
import copy
import importlib.util
import json
import os
from pathlib import Path
import stat
import tempfile
import unittest
from unittest.mock import patch


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


M = load('memory_components_meter', 'kernel-meter.py')
S = load('memory_components_supervisor', 'local-unit-native-supervisor.py')
PARENT = 'helmut-meter-components-test-only'


class Components(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='helmut-components-pure-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.group = self.root / PARENT
        self.group.mkdir()
        self.identity = {'device': self.group.stat().st_dev, 'inode': self.group.stat().st_ino}
        self.patch(patch.object(M, 'CGROUP_ROOT', self.root))
        self.patch(patch.object(M.subprocess, 'run', side_effect=AssertionError('no subprocess')))
        self.write()

    def patch(self, item):
        value = item.start()
        self.addCleanup(item.stop)
        return value

    def write(self, text='anon 120\nfile 30\nkernel 7\nshmem 20\nslab 4\n'):
        (self.group / 'memory.stat').write_text(text)

    def snapshot(self):
        return M.memory_components_snapshot(PARENT, expected_identity=self.identity)

    def unknown(self, result, reason):
        self.assertEqual((result['status'], result['reason']), ('UNKNOWN', reason))
        self.assertEqual(result['componentBytes'], {'anon': None, 'file': None, 'kernel': None})
        self.assertNotIn('pass', result)
        self.assertTrue(result['notUnit60OrReserveEvidence'])

    def test_three_gauges_only_with_real_read_window(self):
        with patch.object(M.time, 'monotonic_ns', side_effect=[100, 145]):
            result = self.snapshot()
        self.assertEqual(result['componentBytes'], {'anon': 120, 'file': 30, 'kernel': 7})
        self.assertEqual(result['groupIdentity'], self.identity)
        self.assertEqual((result['status'], result['reason']), ('OBSERVED', None))
        self.assertEqual((result['monotonicBeginNS'], result['monotonicEndNS'],
                          result['observationElapsedNS']), (100, 145, 45))
        self.assertFalse(result['snapshotsAtomic'])
        self.assertTrue(result['observationOverheadIncluded'])
        self.assertFalse(result['reportSerializationIncluded'])
        self.assertTrue(result['subcategoriesNotAdditive'])
        self.assertTrue(result['notUnit60OrReserveEvidence'])
        self.assertNotIn('pass', result)
        self.assertEqual(json.loads(json.dumps(result)), result)

    def test_actual_zero_is_observed(self):
        self.write('anon 0\nfile 0\nkernel 0\n')
        result = self.snapshot()
        self.assertEqual(result['status'], 'OBSERVED')
        self.assertEqual(result['componentBytes'], dict.fromkeys(('anon', 'file', 'kernel'), 0))

    def test_missing_selected_key_is_unknown_not_zero(self):
        self.write('anon 120\nfile 30\n')
        result = self.snapshot()
        self.assertEqual((result['status'], result['reason']), ('UNKNOWN', 'MISSING_COUNTER'))
        self.assertEqual(result['componentBytes'], {'anon': 120, 'file': 30, 'kernel': None})

    def test_missing_file_is_unknown(self):
        (self.group / 'memory.stat').unlink()
        self.unknown(self.snapshot(), 'MISSING_FILE')

    def test_malformed_duplicate_and_overflow_are_unknown(self):
        values = ['', 'anon 1\nfile 2\nkernel 3\nanon 4\n', 'anon -1\n',
                  'anon 1.5\n', 'anon 01\n', f'anon {2**64}\n',
                  'anon 1\nfile 2\nkernel 3\nunknown -1\n', 'anon 1\n\nfile 2\nkernel 3\n']
        for text in values:
            with self.subTest(text=text):
                self.write(text)
                self.unknown(self.snapshot(), 'MALFORMED_COUNTERS')

    def test_bounded_read_and_row_caps(self):
        self.write('x' * (M.PRESSURE_READ_LIMIT + 1))
        self.unknown(self.snapshot(), 'READ_LIMIT_EXCEEDED')
        self.write(''.join(f'key{i} {i}\n' for i in range(257)))
        self.unknown(self.snapshot(), 'MALFORMED_COUNTERS')

    def test_nonascii_source_is_unknown(self):
        self.write('anon 1\nfile 2\nkernel 3\nother ä\n')
        self.unknown(self.snapshot(), 'INVALID_ENCODING')

    def test_expected_identity_mismatch_never_reads_counters(self):
        with patch.object(M, '_pressure_file', side_effect=AssertionError('wrong group read')):
            result = M.memory_components_snapshot(PARENT, expected_identity={
                'device': self.identity['device'], 'inode': self.identity['inode'] + 1})
        self.unknown(result, 'GROUP_UNAVAILABLE_OR_CHANGED')
        self.assertIsNone(result['groupIdentity'])

    def test_invalid_identity_types_are_unknown(self):
        for identity in (None, {}, {'device': True, 'inode': 1},
                         {**self.identity, 'extra': 1}, {'device': -1, 'inode': 1}):
            with self.subTest(identity=identity):
                self.unknown(M.memory_components_snapshot(PARENT, expected_identity=identity),
                             'GROUP_UNAVAILABLE_OR_CHANGED')

    def test_group_replacement_during_read_discards_old_gauges(self):
        reader = M._pressure_file
        def replace(fd, name):
            answer = reader(fd, name)
            self.group.rename(self.root / 'old-group')
            self.group.mkdir()
            return answer
        with patch.object(M, '_pressure_file', side_effect=replace):
            result = self.snapshot()
        self.unknown(result, 'GROUP_UNAVAILABLE_OR_CHANGED')
        self.assertIsNone(result['groupIdentity'])

    def test_symlinked_group_is_unknown(self):
        self.group.rename(self.root / 'elsewhere')
        self.group.symlink_to(self.root / 'elsewhere', target_is_directory=True)
        self.unknown(self.snapshot(), 'GROUP_UNAVAILABLE_OR_CHANGED')

    def test_fifo_and_symlink_source_do_not_block_or_follow(self):
        target = self.group / 'memory.stat'
        target.unlink()
        os.mkfifo(target)
        self.unknown(self.snapshot(), 'NOT_REGULAR')
        target.unlink()
        outside = self.root / 'outside'
        outside.write_text('anon 1\nfile 2\nkernel 3\n')
        target.symlink_to(outside)
        self.unknown(self.snapshot(), 'READ_ERROR')

    def test_access_denial_is_unknown(self):
        original = M.os.open
        def denied(path, *args, **kwargs):
            if path == 'memory.stat':
                raise PermissionError('fixture denial')
            return original(path, *args, **kwargs)
        with patch.object(M.os, 'open', side_effect=denied):
            self.unknown(self.snapshot(), 'ACCESS_DENIED')

    def test_clock_regression_discards_gauges(self):
        with patch.object(M.time, 'monotonic_ns', side_effect=[150, 100]):
            result = self.snapshot()
        self.unknown(result, 'CLOCK_REGRESSION')
        self.assertIsNone(result['observationElapsedNS'])

    def test_disabled_output_does_not_read_or_create(self):
        with S.memory_components_output(self.root, False) as stream, \
                patch.object(M, 'memory_components_snapshot', side_effect=AssertionError('not opted in')):
            S.retain_memory_components(M, stream, PARENT, {}, 1)
        self.assertFalse((self.root / 'MEMORY_COMPONENTS.PRIVATE.jsonl').exists())

    def test_private_output_retains_bound_samples_and_unknown(self):
        snapshot = {'groupIdentity': self.identity, 'elapsedSeconds': 1.5}
        original = copy.deepcopy(snapshot)
        with S.memory_components_output(self.root, True) as stream:
            S.retain_memory_components(M, stream, PARENT, snapshot, 1)
            (self.group / 'memory.stat').unlink()
            S.retain_memory_components(M, stream, PARENT, snapshot, 2)
        path = self.root / 'MEMORY_COMPONENTS.PRIVATE.jsonl'
        self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
        records = [json.loads(line) for line in path.read_text().splitlines()]
        self.assertEqual([r['sampleIndex'] for r in records], [1, 2])
        self.assertTrue(all(r['parent'] == PARENT and r['groupIdentity'] == self.identity
                            and r['kernelSampleElapsedSeconds'] == 1.5 for r in records))
        self.assertEqual(records[0]['status'], 'OBSERVED')
        self.unknown(records[1], 'MISSING_FILE')
        self.assertEqual(snapshot, original)
        with self.assertRaises(FileExistsError):
            S.memory_components_output(self.root, True)

    def test_output_refuses_existing_symlink(self):
        target = self.root / 'kept'
        target.write_text('preserve')
        (self.root / 'MEMORY_COMPONENTS.PRIVATE.jsonl').symlink_to(target)
        with self.assertRaises(FileExistsError):
            S.memory_components_output(self.root, True)
        self.assertEqual(target.read_text(), 'preserve')

    def test_supervisor_hook_is_only_native_loop_not_final_acceptance(self):
        tree = ast.parse(Path(S.__file__).read_text())
        main = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'main')
        calls = [n for n in ast.walk(main) if isinstance(n, ast.Call)]
        outputs = [n for n in calls if isinstance(n.func, ast.Name) and n.func.id == 'memory_components_output']
        self.assertEqual(len(outputs), 1)
        self.assertEqual(ast.unparse(outputs[0].args[1]), 'args.run_native_single_unit')
        retains = [n for n in calls if isinstance(n.func, ast.Name) and n.func.id == 'retain_memory_components']
        self.assertEqual(len(retains), 1)
        self.assertEqual([ast.unparse(a) for a in retains[0].args],
                         ['kernel', 'components_stream', 'parent', 'snapshot', 'sample_count'])
        finals = [n for n in calls if isinstance(n.func, ast.Attribute) and n.func.attr == 'kernel_snapshot'
                  and any(k.arg == 'require_empty' and isinstance(k.value, ast.Constant)
                          and k.value.value is True for k in n.keywords)]
        self.assertEqual(len(finals), 1)


if __name__ == '__main__':
    unittest.main()
