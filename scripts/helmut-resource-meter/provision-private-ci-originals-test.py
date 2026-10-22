#!/usr/bin/env python3
"""Negative verifier tests only; tiny invented bytes never stand in for originals."""
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('private_provision', Path(__file__).with_name('provision-private-ci-originals.py'))
P = importlib.util.module_from_spec(spec)
spec.loader.exec_module(P)


class PrivateProvisionNegativeTest(unittest.TestCase):
    def fixture(self, root, name='TEST_ONLY.txt', data=b'TEST_ONLY_NOT_AN_ORIGINAL'):
        relative = Path('TEST_ONLY_PRIVATE_BUNDLE') / name
        file = root / relative
        file.parent.mkdir(mode=0o700, exist_ok=True)
        file.write_bytes(data)
        file.chmod(0o600)
        return {'path': '/workspace/' + str(relative), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}

    def test_manifest_rejects_missing_duplicate_noncanonical_outside_and_oversized_inputs(self):
        original = json.loads(P.MANIFEST.read_text())
        def row_change(key, value):
            changed = copy.deepcopy(original)
            changed['files'][0][key] = value
            return changed
        changed = copy.deepcopy(original)
        changed['files'][1] = changed['files'][0]
        variants = [changed, {**original, 'files': original['files'][:-1]},
                    {**original, 'totalBytes': original['totalBytes'] + 1},
                    {**original, 'fileCount': True}, {**original, 'canonicalWorkspace': '/tmp'},
                    {**original, 'extraAuthority': True}]
        variants += [row_change('path', value) for value in [
            '/workspace/../elsewhere/input', '/workspace//private/input', '/etc/private/input',
            'workspace/private/input', '/workspace/private/./input', '/workspace/private/input\x00']]
        variants += [row_change('bytes', value) for value in [0, -1, True, P.MAX_FILE_BYTES + 1]]
        variants += [row_change('sha256', value) for value in ['0' * 63, 'G' * 64, None]]
        for changed in variants:
            with self.subTest(index=variants.index(changed)), self.assertRaises(RuntimeError):
                P.validate_manifest(changed)

    def test_manifest_byte_tampering_is_rejected_before_parsing(self):
        with tempfile.TemporaryDirectory() as td:
            file = Path(td) / 'TEST_ONLY_MANIFEST.json'
            file.write_text('{}')
            with patch.object(P, 'MANIFEST', file), self.assertRaises(RuntimeError):
                P.load_manifest()

    def test_root_rejects_symlink_parent_noncanonical_and_public_bundle(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            actual = root / 'actual'
            actual.mkdir(mode=0o700)
            (actual / 'inside').mkdir()
            (root / 'alias').symlink_to(actual, target_is_directory=True)
            for value in [str(root / 'alias' / 'inside'), str(root) + '/../elsewhere', str(root) + '//actual']:
                with self.subTest(path=value), self.assertRaises((OSError, RuntimeError)):
                    P.root_fd(value)
            actual.chmod(0o755)
            with self.assertRaises(RuntimeError):
                P.root_fd(str(actual), private=True)

    def test_source_rejects_hash_size_permissions_symlink_hardlink_and_fifo(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            row = self.fixture(root)
            file = root / P.relative_path(row)
            fd = P.root_fd(str(root), private=True)
            try:
                for change in [{'sha256': '0' * 64}, {'bytes': row['bytes'] + 1}]:
                    with self.subTest(change=change), self.assertRaises(RuntimeError):
                        P.read_original(fd, {**row, **change})
                file.chmod(0o644)
                with self.assertRaises(RuntimeError): P.read_original(fd, row)
                file.chmod(0o600)
                alias = root / 'TEST_ONLY_HARDLINK'
                os.link(file, alias)
                with self.assertRaises(RuntimeError): P.read_original(fd, row)
                alias.unlink()
                file.unlink()
                file.symlink_to(root / 'TEST_ONLY_MISSING')
                with self.assertRaises(OSError): P.read_original(fd, row)
                file.unlink()
                os.mkfifo(file, mode=0o600)
                with self.assertRaises(RuntimeError): P.read_original(fd, row)
            finally:
                os.close(fd)

    def test_destination_rejects_existing_file_dangling_symlink_and_parent_symlink(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            row = self.fixture(root)
            file = root / P.relative_path(row)
            fd = P.root_fd(str(root))
            try:
                with self.assertRaises(RuntimeError): P.assert_absent(fd, row)
                file.unlink()
                file.symlink_to(root / 'TEST_ONLY_MISSING')
                with self.assertRaises(RuntimeError): P.assert_absent(fd, row)
                file.unlink()
                file.parent.rmdir()
                file.parent.symlink_to(root, target_is_directory=True)
                with self.assertRaises(OSError): P.assert_absent(fd, row)
            finally:
                os.close(fd)

    def test_provision_missing_later_source_creates_nothing_even_with_write(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            source, destination = root / 'source', root / 'destination'
            source.mkdir(mode=0o700)
            destination.mkdir(mode=0o700)
            first = self.fixture(source)
            missing = {**first, 'path': '/workspace/TEST_ONLY_PRIVATE_BUNDLE/MISSING.txt'}
            with patch.object(P, 'load_manifest', return_value=[first, missing]):
                with self.assertRaises(FileNotFoundError):
                    P.provision(str(source), str(destination), write=True)
            self.assertEqual(list(destination.iterdir()), [])

    def test_insufficient_disk_and_same_root_reject_before_source_reads(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            source, destination = root / 'source', root / 'destination'
            source.mkdir(mode=0o700)
            destination.mkdir(mode=0o700)
            with patch.object(P, 'read_original') as read:
                with self.assertRaises(RuntimeError): P.provision(str(source), str(source), write=True)
                with patch.object(P.os, 'fstatvfs', return_value=SimpleNamespace(f_bavail=0, f_frsize=4096)):
                    with self.assertRaises(RuntimeError): P.provision(str(source), str(destination), write=True)
                read.assert_not_called()
            self.assertEqual(list(destination.iterdir()), [])

    def test_occupied_later_destination_leaves_all_original_bytes_untouched(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            source, destination = root / 'source', root / 'destination'
            source.mkdir(mode=0o700)
            destination.mkdir(mode=0o700)
            first = self.fixture(source)
            occupied = self.fixture(source, 'SECOND.txt')
            self.fixture(destination, 'SECOND.txt', b'TEST_ONLY_KEEP_UNCHANGED')
            with patch.object(P, 'load_manifest', return_value=[first, occupied]):
                with self.assertRaises(RuntimeError): P.provision(str(source), str(destination), write=True)
            self.assertFalse((destination / P.relative_path(first)).exists())
            self.assertEqual((destination / P.relative_path(occupied)).read_bytes(), b'TEST_ONLY_KEEP_UNCHANGED')

    def test_destination_created_after_preflight_is_never_overwritten(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            source, destination = root / 'source', root / 'destination'
            source.mkdir(mode=0o700)
            destination.mkdir(mode=0o700)
            row = self.fixture(source)
            original_parent = P.parent_fd
            def raced_parent(fd, relative, create=False):
                parent = original_parent(fd, relative, create=create)
                if create:
                    file = destination / relative
                    file.write_bytes(b'TEST_ONLY_CONCURRENT_OWNER')
                return parent
            with patch.object(P, 'load_manifest', return_value=[row]), patch.object(P, 'parent_fd', side_effect=raced_parent):
                with self.assertRaises(FileExistsError): P.provision(str(source), str(destination), write=True)
            self.assertEqual((destination / P.relative_path(row)).read_bytes(), b'TEST_ONLY_CONCURRENT_OWNER')


if __name__ == '__main__':
    unittest.main()
