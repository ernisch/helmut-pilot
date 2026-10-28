"""Small fictional copy/split checks; no GPG, original files or uploads."""
import hashlib
import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('w15_transfer_test', Path(__file__).with_name('source_transfer.py'))
T = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(T)


class TransferChecks(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory(prefix='w15-fictional-copy-')
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        self.src = self.root / 'source'
        self.dst = self.root / 'target'
        self.src.mkdir(mode=0o700)
        self.dst.mkdir(mode=0o700)
        self.original = self.src / 'selected'
        self.raw = b'FICTIONAL-SELECTED-BYTES'
        self.original.write_bytes(self.raw)
        self.original.chmod(0o600)
        self.pin = {'bytes': len(self.raw), 'sha256': hashlib.sha256(self.raw).hexdigest()}

    def copy(self, pin=None):
        with patch.object(T.I, 'SOURCE_ROOT', str(self.root)):
            fd = T.I._source_root()
            target = T.S._directory(str(self.dst), private=True)
            try:
                return T.copy_one(fd, str(self.original), target, 'copy', pin or self.pin)
            finally:
                os.close(fd)
                os.close(target)

    def split(self, **kw):
        target = T.S._directory(str(self.dst), private=True)
        try:
            return T.split_cipher(self.original, target, **kw)
        finally:
            os.close(target)

    def test_copy_preserves_original_and_creates_separate_private_inode(self):
        before = T.S._snapshot(self.original.stat())
        self.assertEqual(self.copy(), before)
        self.assertEqual((self.dst / 'copy').read_bytes(), self.raw)
        self.assertEqual(T.S._snapshot(self.original.stat()), before)
        self.assertNotEqual(self.original.stat().st_ino, (self.dst / 'copy').stat().st_ino)
        self.assertEqual((self.dst / 'copy').stat().st_mode & 0o777, 0o600)

    def test_wrong_hash_keeps_partial_unaccepted_and_original_unchanged(self):
        with self.assertRaises(ValueError):
            self.copy({**self.pin, 'sha256': '0' * 64})
        self.assertEqual(self.original.read_bytes(), self.raw)
        self.assertTrue((self.dst / 'copy').exists())

    def test_wrong_size_stops_before_copy(self):
        with self.assertRaises(ValueError):
            self.copy({**self.pin, 'bytes': len(self.raw) + 1})
        self.assertFalse((self.dst / 'copy').exists())

    def test_original_hardlink_rejected(self):
        os.link(self.original, self.src / 'alias')
        with self.assertRaises(T.I.P.Rejected):
            self.copy()
        self.assertFalse((self.dst / 'copy').exists())

    def test_original_symlink_rejected(self):
        link = self.src / 'link'
        link.symlink_to(self.original)
        self.original = link
        with self.assertRaises(OSError):
            self.copy()

    def test_existing_copy_is_never_overwritten(self):
        self.copy()
        with self.assertRaises(FileExistsError):
            self.copy()

    def test_split_hash_order_and_bytes(self):
        result = self.split(part_bytes=8)
        self.assertEqual(result['cipherBytes'], len(self.raw))
        self.assertEqual(result['cipherSHA256'], self.pin['sha256'])
        self.assertEqual([p['index'] for p in result['parts']], [1, 2, 3])
        self.assertEqual(b''.join((self.dst / x['name']).read_bytes() for x in result['parts']), self.raw)

    def test_split_refuses_oversize_before_first_part(self):
        with self.assertRaises(ValueError):
            self.split(maximum_bytes=1)
        self.assertEqual(list(self.dst.iterdir()), [])

    def test_split_existing_part_not_overwritten(self):
        self.split(part_bytes=8)
        with self.assertRaises(FileExistsError):
            self.split(part_bytes=8)

    def test_missing_or_wrong_go_does_not_inventory_or_write(self):
        with patch.object(T.I, 'inventory') as inventory:
            with self.assertRaises(ValueError):
                T.export_once('0' * 64)
            inventory.assert_not_called()


if __name__ == '__main__':
    unittest.main()
