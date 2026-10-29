"""New V2 parent adapter only, using fictional files and mocked systemctl."""
import sys
sys.dont_write_bytecode = True
import importlib.util
import os
from pathlib import Path
import stat
import tempfile
import unittest
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location('w15_mock_parent_checks', Path(__file__).with_name('mock500_parent.py'))
P = importlib.util.module_from_spec(spec); spec.loader.exec_module(P)
CTX = P.context('12345678901', 'a' * 40, '123e4567-e89b-42d3-a456-426614174000')


def sample():
    return {'configuredLimit': '2048000000', 'swapMaximum': '0', 'kernelLifetimePeakBytes': 1234,
            'currentBytes': 123, 'swapCurrentBytes': 0,
            'events': {key: 0 for key in ('max', 'oom', 'oom_kill', 'oom_group_kill')}}


class MockParentChecks(unittest.TestCase):
    def test_v2_unit_is_separate_from_unchanged_end500_parent(self):
        self.assertEqual((P.LIMIT, P.MAXIMUM, P.RESERVE), (2048000000, 1638400000, 409600000))
        self.assertIn(b'MemoryMax=2048000000\nMemorySwapMax=0\n', P.unit_bytes())
        self.assertIn(b'MemoryMax=2560000000\n', P.P.unit_bytes())
        self.assertEqual(P.names(CTX), P.P.names(CTX))
        with patch.object(P, '_load', return_value=Mock()) as load:
            P.resources()
        self.assertEqual(load.call_args.args, ('mock500_resources', 'w15_mock_parent_assessor'))

    def test_prepare_defines_v2_before_start_and_rejects_existing_parent(self):
        with tempfile.TemporaryDirectory(prefix='w15-fictional-mock-parent-') as tmp:
            base = Path(tmp); units = base / 'units'; units.mkdir(); kernel = base / 'kernel'; kernel.mkdir()
            calls = []
            def command(argv, **kwargs):
                self.assertEqual((units / P.names(CTX)[0]).read_bytes(), P.unit_bytes())
                calls.append(argv)
            with patch.object(P, 'UNIT_ROOT', units), patch.object(P.P.R, 'KERNEL_ROOT', kernel), \
                    patch.object(P.os, 'getuid', return_value=0), \
                    patch.object(P.Path, 'read_text', return_value='systemd\n'), \
                    patch.object(P.P, 'command', side_effect=command), \
                    patch.object(P, 'identity', return_value=(1, 2)), patch.object(P, 'read_parent') as read:
                P.prepare_parent(CTX)
                read.assert_called_once_with(CTX, (1, 2), empty=True)
                (kernel / P.names(CTX)[0]).mkdir()
                with self.assertRaises(P.MockParentError): P.prepare_parent(CTX)
            self.assertEqual(calls, [['/usr/bin/systemctl', 'daemon-reload'],
                                     ['/usr/bin/systemctl', 'start', P.names(CTX)[0]]])
            self.assertEqual(stat.S_IMODE((units / P.names(CTX)[0]).stat().st_mode), 0o600)

    def test_actual_fixture_readback_delegates_v2_assessment_without_peak_writes(self):
        with tempfile.TemporaryDirectory(prefix='w15-fictional-mock-cgroup-') as tmp:
            root = Path(tmp); expected = sample()
            fields = {'memory.max': expected['configuredLimit'], 'memory.swap.max': '0',
                      'memory.peak': '1234', 'memory.current': '123', 'memory.swap.current': '0',
                      'memory.events': 'max 0\noom 0\noom_kill 0\noom_group_kill 0',
                      'cgroup.events': 'populated 0\nfrozen 0'}
            for name, value in fields.items(): (root / name).write_text(value)
            inode = (root.stat().st_dev, root.stat().st_ino)
            assessor = Mock()
            def directory(_): return os.open(root, os.O_RDONLY | os.O_DIRECTORY)
            with patch.object(P.P.R, '_kernel_directory', side_effect=directory), \
                    patch.object(P, 'resources', return_value=assessor):
                self.assertEqual(P.read_parent(CTX, inode, empty=True), expected)
                assessor.assess.assert_called_once_with(expected)
                with self.assertRaises(P.MockParentError): P.read_parent(CTX, (0, 0), empty=True)
                (root / 'cgroup.events').write_text('populated 1\nfrozen 0')
                with self.assertRaises(P.MockParentError): P.read_parent(CTX, inode, empty=True)
            self.assertEqual((root / 'memory.peak').read_text(), '1234')

    def test_canonical_assessor_failure_remains_failure(self):
        with tempfile.TemporaryDirectory(prefix='w15-fictional-mock-assess-') as tmp:
            root = Path(tmp)
            for name, value in {'memory.max': '2560000000', 'memory.swap.max': '0', 'memory.peak': '1',
                                'memory.current': '1', 'memory.swap.current': '0', 'memory.events': 'max 0',
                                'cgroup.events': 'populated 0'}.items(): (root / name).write_text(value)
            inode = (root.stat().st_dev, root.stat().st_ino)
            assessor = Mock(); assessor.assess.side_effect = ValueError('FICTIONAL_WRONG_PROFILE')
            with patch.object(P.P.R, '_kernel_directory', side_effect=lambda _: os.open(root, os.O_RDONLY)), \
                    patch.object(P, 'resources', return_value=assessor):
                with self.assertRaises(P.MockParentError): P.read_parent(CTX, inode, empty=True)
            self.assertEqual(assessor.assess.call_args.args[0]['configuredLimit'], '2560000000')

    def test_remove_rejects_other_unit_content_before_stop_or_unlink(self):
        with tempfile.TemporaryDirectory(prefix='w15-fictional-mock-unit-') as tmp:
            units = Path(tmp); file = units / P.names(CTX)[0]
            file.write_bytes(P.P.unit_bytes()); file.chmod(0o600)
            with patch.object(P, 'UNIT_ROOT', units), patch.object(P.os, 'getuid', return_value=0), \
                    patch.object(P.P, 'command') as command:
                with self.assertRaises(P.MockParentError): P.remove_parent(CTX)
                command.assert_not_called()
            self.assertTrue(file.exists())

    def test_privileged_argv_contains_only_fixed_helper_and_public_context(self):
        with patch.object(P.P, 'command') as command:
            P.privileged('prepare', CTX)
        argv = command.call_args.args[0]
        self.assertEqual(argv[:4], ['/usr/bin/sudo', '-n', '/usr/bin/env', '-i'])
        self.assertIn(str(P.SCRIPT), argv)
        self.assertNotIn('GITHUB_TOKEN', ' '.join(argv))
        with self.assertRaises(P.MockParentError): P.privileged('arbitrary-command', CTX)


if __name__ == '__main__': unittest.main()
