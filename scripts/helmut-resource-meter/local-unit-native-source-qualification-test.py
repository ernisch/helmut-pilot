"""Offline attack checks. No service, DB, socket or motor is started."""
from pathlib import Path
import hashlib
import importlib.util
import os
import tempfile
import unittest
from unittest import mock

SOURCE = Path(__file__).with_name('local-unit-native-source-qualification.py')
spec = importlib.util.spec_from_file_location('source_observer', SOURCE)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SourceObserverChecks(unittest.TestCase):
    def test_actual_private_fd_bytes_are_bound(self):
        with tempfile.TemporaryDirectory(prefix='helmut-source-pin-') as directory:
            p = Path(directory) / 'original'
            data = b'synthetic-byte-pin-only'
            p.write_bytes(data)
            p.chmod(0o600)
            pin = {'path': str(p), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
            identity, read = module.file_pin(pin, private=True, content=True)
            self.assertEqual(read, data)
            self.assertEqual(identity, module.identity(p.lstat()))

    def test_fifo_never_blocks_or_supplies_config(self):
        with tempfile.TemporaryDirectory(prefix='helmut-source-fifo-') as directory:
            p = Path(directory) / 'fifo'
            os.mkfifo(p, 0o600)
            with self.assertRaisesRegex(module.SourceQualificationError, 'file-metadata'):
                module.file_pin({'path': str(p), 'bytes': 1, 'sha256': 'a' * 64}, private=True, content=True)

    def test_named_inode_change_rejects_even_same_bytes(self):
        with tempfile.TemporaryDirectory(prefix='helmut-source-swap-') as directory:
            p = Path(directory) / 'original'
            data = b'synthetic-byte-pin-only'
            p.write_bytes(data)
            p.chmod(0o600)
            original, calls = os.fstat, []

            def changed(fd):
                value = original(fd)
                calls.append(fd)
                if len(calls) == 2:
                    p.rename(p.with_name('detached'))
                    p.write_bytes(data)
                    p.chmod(0o600)
                return value

            with mock.patch.object(module.os, 'fstat', side_effect=changed):
                with self.assertRaisesRegex(module.SourceQualificationError, 'file-drift'):
                    module.file_pin({'path': str(p), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}, private=True)

    def test_key_shapes_and_duplicate_json_do_not_establish_evidence(self):
        for raw in (b'{"pid":1,"pid":2}', b'"\xff"'):
            with self.assertRaises((module.SourceQualificationError, UnicodeError)):
                module.unique_json(raw)
        for pin in ({'path': '/unused', 'bytes': True, 'sha256': 'a' * 64},
                    {'path': '/unused', 'bytes': 0, 'sha256': 'a' * 64},
                    {'path': '/unused', 'bytes': 4 * 1024**2 + 1, 'sha256': 'a' * 64}):
            with self.assertRaisesRegex(module.SourceQualificationError, 'file-pin'):
                module.file_pin(pin, content=True)

    def test_budget_is_an_actual_typed_bounded_node_observation(self):
        value = {'nodeVersion': 'v24.19.0', 'execArgv': ['--max-old-space-size=384', '--max-semi-space-size=16'],
                 'oldSpaceMiB': 384, 'semiSpaceMiB': 16, 'heapSizeLimitBytes': 432 * 1024**2}
        module.node_budget(value)
        for key, changed in [('heapSizeLimitBytes', 512 * 1024**2), ('heapSizeLimitBytes', True),
                             ('heapSizeLimitBytes', 383 * 1024**2), ('nodeVersion', 'v24.18.0'),
                             ('execArgv', value['execArgv'] + ['--inspect']), ('oldSpaceMiB', 512)]:
            with self.subTest(key=key, changed=changed):
                with self.assertRaisesRegex(module.SourceQualificationError, 'actual-node-budget'):
                    module.node_budget({**value, key: changed})

    def test_process_requires_actual_uid_caps_nnp_and_live_identity(self):
        status = 'Uid:\t1000\t1000\t1000\t1000\nGid:\t1000\t1000\t1000\t1000\n'
        status += ''.join(key + ':\t00000000\n' for key in ('CapInh', 'CapPrm', 'CapEff', 'CapBnd', 'CapAmb'))
        status += 'NoNewPrivs:\t1\n'
        fields = ['S', '11'] + ['0'] * 17 + ['987']

        def observe(current_status=status, state='S'):
            def read(path):
                if path.name == 'status':
                    return current_status
                if path.name == 'cgroup':
                    return '0::/\n'
                if path.name == 'stat':
                    return '12 (synthetic name with ) parenthesis) ' + ' '.join([state, *fields[1:]])
                raise AssertionError('unexpected filesystem read')
            with mock.patch.object(module.Path, 'read_text', read), mock.patch.object(module.os, 'readlink',
                 side_effect=lambda path: 'pid:[12345]' if str(path).endswith('ns/pid') else '/fixed/node'):
                return module.process_identity(12)

        self.assertEqual(observe()['startTicks'], '987')
        self.assertEqual(observe()['parentPID'], 11)
        for changed, state in [(status.replace('1000\t1000\t1000\t1000', '0\t0\t0\t0'), 'S'),
                               (status.replace('CapEff:\t00000000', 'CapEff:\t00000001'), 'S'),
                               (status.replace('NoNewPrivs:\t1', 'NoNewPrivs:\t0'), 'S'), (status, 'Z')]:
            with self.assertRaises(module.SourceQualificationError):
                observe(changed, state)


if __name__ == '__main__':
    unittest.main()
