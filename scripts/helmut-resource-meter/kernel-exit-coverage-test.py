#!/usr/bin/env python3
"""Pure late-entry/replaced-group cases; no containers or Helmut execution."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('kernel_exit_meter', Path(__file__).with_name('kernel-meter.py'))
meter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(meter)


class ExitCoverage(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='helmut-kernel-exit-')
        self.group = Path(self.temp.name)
        for name, text in {'cgroup.events': 'populated 0\nfrozen 0\n', 'cgroup.procs': '',
                           'memory.peak': '4096', 'memory.current': '0', 'memory.events': 'oom 0\noom_kill 0\n',
                           'cpu.stat': 'usage_usec 1\n', 'io.stat': ''}.items():
            (self.group / name).write_text(text)
        self.parent = patch.object(meter, 'validated_parent', return_value=self.group)
        self.parent.start()
        self.addCleanup(self.parent.stop)
        self.addCleanup(self.temp.cleanup)

    def test_empty_group_has_last_exit_observation(self):
        result = meter.kernel_snapshot('synthetic', require_empty=True)
        self.assertTrue(result['fullLastProcessExitCovered'])
        self.assertEqual(result['finalEvents']['populated'], 0)

    def test_process_enters_after_initial_empty_read(self):
        actual = meter.key_values
        def observed(path):
            result = actual(path)
            if path.name == 'cpu.stat':
                (self.group / 'cgroup.events').write_text('populated 1\nfrozen 0\n')
                (self.group / 'cgroup.procs').write_text('123\n')
            return result
        with patch.object(meter, 'key_values', side_effect=observed):
            with self.assertRaisesRegex(RuntimeError, 'became populated'):
                meter.kernel_snapshot('synthetic', require_empty=True)

    def test_subgroup_with_live_process_blocks_empty_claim(self):
        child = self.group / 'late-child'
        child.mkdir(); (child / 'cgroup.procs').write_text('456\n')
        with self.assertRaisesRegex(RuntimeError, 'became populated'):
            meter.kernel_snapshot('synthetic', require_empty=True)

    def test_live_observation_never_asserts_final_exit(self):
        self.assertFalse(meter.kernel_snapshot('synthetic')['fullLastProcessExitCovered'])


if __name__ == '__main__':
    unittest.main()
