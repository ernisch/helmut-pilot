"""Offline boundaries for the native preparation publisher; no DB or engine."""
import importlib.util
import json
from pathlib import Path
import tempfile
import threading
import time
import types
import unittest

spec = importlib.util.spec_from_file_location('native_binding_preparation', Path(__file__).with_name('local-unit-native-binding-preparation.py'))
preparation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preparation)


class PreparationBoundaries(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='helmut-binding-publication-')
        self.addCleanup(self.temp.cleanup)
        self.worker = types.SimpleNamespace(OUT=Path(self.temp.name))

    def test_reader_observes_complete_single_link_compact_json(self):
        expected = {'schema': 'bounded-private-input', 'text': 'Prüfung' * 100000, 'nested': {'nonce': 'a' * 64}}
        destination = self.worker.OUT / 'INPUT.PRIVATE.json'
        observed, ready = [], threading.Event()

        def reader():
            ready.set()
            deadline = time.monotonic() + 5
            while not destination.exists() and time.monotonic() < deadline:
                time.sleep(.0001)
            if not destination.exists():
                return
            info = destination.lstat()
            observed.append((info.st_nlink, info.st_mode & 0o777, destination.read_bytes()))

        thread = threading.Thread(target=reader)
        thread.start(); ready.wait(timeout=2)
        preparation.compact_private(self.worker, destination.name, expected)
        thread.join(timeout=3)
        self.assertFalse(thread.is_alive())
        self.assertEqual(observed[0][:2], (1, 0o600))
        raw = observed[0][2]
        self.assertEqual(json.loads(raw), expected)
        self.assertEqual(raw.decode(), json.dumps(expected, ensure_ascii=False, separators=(',', ':')))

    def test_existing_attempt_is_never_overwritten(self):
        target = self.worker.OUT / 'COMMAND_INPUT.PRIVATE.json'
        target.write_bytes(b'preserved-consumed-input')
        before = target.lstat()
        with self.assertRaises(FileExistsError):
            preparation.compact_private(self.worker, target.name, {'new': 'forbidden'})
        self.assertEqual(target.read_bytes(), b'preserved-consumed-input')
        self.assertEqual(target.lstat().st_ino, before.st_ino)

    def test_symlink_destination_is_never_followed_or_replaced(self):
        original = self.worker.OUT / 'original'
        original.write_bytes(b'preserve-original')
        target = self.worker.OUT / 'COMMAND_INPUT.PRIVATE.json'
        target.symlink_to(original)
        with self.assertRaises(FileExistsError):
            preparation.compact_private(self.worker, target.name, {'replacement': False})
        self.assertTrue(target.is_symlink())
        self.assertEqual(original.read_bytes(), b'preserve-original')

    def test_only_actual_invoker_readers_are_selected_from_catalog(self):
        entries = [{'name': name, 'oid': str(index + 1), 'securityDefiner': False}
                   for index, name in enumerate(preparation.READERS)]
        entries += [{'name': 'public.helmut_auth_state_cas_v1', 'securityDefiner': False},
                    {'name': preparation.READERS[0], 'securityDefiner': True}]
        actual = preparation.source_functions({'functions': entries})
        self.assertEqual([row['name'] for row in actual], list(preparation.READERS))
        self.assertTrue(all('securityDefiner' not in row for row in actual))


if __name__ == '__main__':
    unittest.main()
