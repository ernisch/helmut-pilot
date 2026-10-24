#!/usr/bin/env python3
"""Bounded child I/O and cleanup cases, without databases or motor calls."""
import importlib.util
from pathlib import Path
import sys
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('unit_native_worker_io', Path(__file__).with_name('local-unit-native-worker.py'))
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class NativeSupervision(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='helmut-unit-native-io-')
        self.addCleanup(self.temp.cleanup)
        worker.OUT = Path(self.temp.name)
        worker.CHILDREN.clear()

    def tearDown(self):
        self.assertTrue(all(child.poll() is not None for child in worker.CHILDREN))

    def child(self, code, **options):
        return worker.capture([sys.executable, '-I', '-S', '-B', '-c', code], 'case', **options)

    def test_bidirectional_input_output_does_not_deadlock(self):
        raw = b'bound-input' * 16000
        result = self.child('import sys;sys.stdout.buffer.write(sys.stdin.buffer.read());sys.stderr.write("done")', data=raw)
        self.assertEqual(result, raw)
        self.assertEqual((worker.OUT / 'case.STDERR.PRIVATE.log').read_text(), 'done')

    def test_large_stderr_is_stopped_with_bounded_retained_data(self):
        with self.assertRaisesRegex(RuntimeError, 'capture overflow'):
            self.child('import os;os.write(2,b"x"*1048576)')
        self.assertLessEqual((worker.OUT / 'case.STDERR.PRIVATE.log').stat().st_size, 128 * 1024)

    def test_large_stdout_is_stopped_with_bounded_retained_data(self):
        with self.assertRaisesRegex(RuntimeError, 'capture overflow'):
            self.child('import os;os.write(1,b"x"*8388608)')
        self.assertLessEqual((worker.OUT / 'case.STDOUT.PRIVATE.log').stat().st_size, 2 * 1024**2)

    def test_eof_without_process_exit_is_not_accepted(self):
        with self.assertRaises((RuntimeError, worker.subprocess.TimeoutExpired)):
            self.child('import os,time;os.close(1);os.close(2);time.sleep(5)', timeout=.3)


if __name__ == '__main__':
    unittest.main()
