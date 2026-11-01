"""Fictional cgroup files/PID paths; no cgroup, UID or resource changes."""
import copy
import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('w15_common_test', Path(__file__).with_name('common_resources.py'))
R = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(R)


class CommonResourcesChecks(unittest.TestCase):
    def sample(self):
        return {'configuredLimit': '2560000000', 'swapMaximum': '0',
                'kernelLifetimePeakBytes': 2048000000, 'currentBytes': 123456,
                'swapCurrentBytes': 0, 'events': {k: 0 for k in ('max', 'oom', 'oom_kill', 'oom_group_kill')}}

    def test_actual_peak_boundary_preserves_full_reserve(self):
        self.assertEqual(R.assess(self.sample())['kernelLifetimePeakBytes'], 2048000000)
        value = self.sample(); value['kernelLifetimePeakBytes'] += 1
        with self.assertRaises(R.ResourceError): R.assess(value)

    def test_swap_event_and_unknown_measurements_rejected(self):
        values = []
        for key, value in [('swapMaximum', 'max'), ('swapCurrentBytes', 1), ('configuredLimit', '2048000000'), ('currentBytes', None)]:
            row = self.sample(); row[key] = value; values.append(row)
        row = self.sample(); row['events']['oom_kill'] = 1; values.append(row)
        row = self.sample(); row['kernelLifetimePeakBytes'] = True; values.append(row)
        for value in values:
            with self.subTest(value=value), self.assertRaises(R.ResourceError): R.assess(value)

    def binding(self):
        path = R.KERNEL_ROOT / ('w15_123456_' + 'a' * 32 + '.slice')
        return R.CommonResources(R.TOKEN, {}, path, (0, 0))

    def test_container_only_parent_excludes_python_and_is_rejected(self):
        obj = self.binding()
        with patch.object(Path, 'read_text', return_value='0::/user.slice/controller.scope\n'):
            with self.assertRaises(R.ResourceError): obj.check_pid(os.getpid())

    def test_common_parent_includes_controller_and_container_descendants(self):
        obj = self.binding(); prefix = '/' + obj.unit
        with patch.object(Path, 'read_text', return_value='0::' + prefix + '/control.scope\n'):
            self.assertTrue(obj.check_pid(os.getpid()).endswith('/control.scope'))
        container = 'f' * 64
        with patch.object(Path, 'read_text', return_value='0::' + prefix + '/docker-' + container + '.scope\n'):
            obj.check_pid(os.getpid(), container)
            with self.assertRaises(R.ResourceError): obj.check_pid(os.getpid(), 'e' * 64)

    def test_namespaced_traversal_and_multiple_hierarchies_rejected(self):
        for raw in ('0::/../test', '0::/a/../b', '1:memory:/a\n0::/b', '0::/a//b'):
            with self.subTest(raw=raw), self.assertRaises(R.ResourceError): R.membership(raw)

    def test_uid1001_cannot_silently_relax_private_mapping(self):
        with patch.object(R.os, 'getuid', return_value=1001), patch.object(R, '_kernel_directory') as opened:
            with self.assertRaises(R.ResourceError): R.observe({})
            opened.assert_not_called()

    def test_kernel_counter_readback_is_used_and_identity_must_match(self):
        with tempfile.TemporaryDirectory(prefix='w15-fictional-cgroup-') as tmp:
            path = Path(tmp); value = self.sample()
            files = {'memory.max': value['configuredLimit'], 'memory.swap.max': '0',
                     'memory.peak': str(value['kernelLifetimePeakBytes']), 'memory.current': str(value['currentBytes']),
                     'memory.swap.current': '0', 'memory.events': '\n'.join(k + ' 0' for k in value['events'])}
            for name, raw in files.items(): (path / name).write_text(raw)
            s = path.stat(); obj = self.binding(); obj._identity = (s.st_dev, s.st_ino)
            def opened(_): return os.open(path, os.O_RDONLY | os.O_DIRECTORY)
            with patch.object(R, '_kernel_directory', side_effect=opened), patch.object(obj, 'check_pid'):
                self.assertEqual(obj.sample(), value)
                (path / 'memory.peak').write_text('2048000001')
                with self.assertRaises(R.ResourceError): obj.sample()
                observed = obj.last_observation()
                self.assertFalse(observed['lastReadbackValid'])
                self.assertFalse(observed['fullLifetimeClosureAccepted'])
                self.assertEqual(observed['lastObservedKernelSample']['kernelLifetimePeakBytes'], 2048000001)


if __name__ == '__main__': unittest.main()
