"""Four small fictional inventories; no existing originals or500 qualification."""
import sys
sys.dont_write_bytecode = True
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('mock500_existing_inventory_tested', Path(__file__).with_name('mock500_existing_inventory.py'))
I = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(I)
MARKER = b'FICTIONAL_CONTENT_MUST_NEVER_PRINT'


class ExistingInventoryChecks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='w15-fictional-existing-inventory-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.paths, self.pins = {}, {}
        def create(key, data):
            path = self.root / (key + '.PRIVATE')
            path.write_bytes(data); path.chmod(0o600)
            self.paths[key] = path
            self.pins[key] = {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
            return {'path': str(path), **self.pins[key]}
        qualified = {key: create(key, MARKER + key.encode()) for key in I.QUALIFIED}
        for key in ('package', 'normalizedCurrentPolicy', 'originalUPacket', 'publicationPolicy', 'originalBuilderArchive'):
            create(key, MARKER + key.encode())
        receipt = {'actualFileCount': 11, 'actualPayloadBytes': 96530256, 'files': [
            {'key': key, 'status': 'PASS', 'receivedPath': str(self.paths[key]),
             'expectedBytes': self.pins[key]['bytes'], 'expectedSHA256': self.pins[key]['sha256']}
            for key in ('package', 'normalizedCurrentPolicy', 'originalUPacket')]}
        create('originalReception', json.dumps(receipt, sort_keys=True).encode())
        report = {'status': 'PASS_ALL500_CURRENT_ORIGINAL_MOCK_BINDINGS', 'completedOwners': 500,
            'qualifiedOwners': 500, 'failedOwners': 0, 'qualifiedAssetsPinned': True, 'sourceDatesRewritten': False,
            'qualifiedAssets': {old: qualified[key] for key, old in I.QUALIFIED.items() if old is not None},
            'currentNativeReplacementsPin': qualified['currentReplacements']}
        create('qualificationReport', json.dumps(report, sort_keys=True).encode())
        self.known_pins = {key: self.pins[key] for key in I.PINS}
        self.options = {'qualification_report': str(self.paths['qualificationReport']),
            'original_reception': str(self.paths['originalReception']),
            'publication_policy': str(self.paths['publicationPolicy']), 'builder_archive': str(self.paths['originalBuilderArchive'])}

    def inventory(self):
        with patch.object(I, 'PINS', self.known_pins):
            return I.inventory_existing(**self.options)

    def test_resolves_all_existing_pins_once_without_writes_or_contents_output(self):
        before = {p.name: (p.stat().st_ino, p.stat().st_size, p.stat().st_mtime_ns, p.stat().st_ctime_ns) for p in self.root.iterdir()}
        opens, original = [], os.open
        def readonly(path, flags, *args, **kwargs):
            opens.append(flags)
            self.assertEqual(flags & os.O_ACCMODE, os.O_RDONLY)
            self.assertFalse(flags & (os.O_CREAT | os.O_TRUNC | os.O_APPEND))
            return original(path, flags, *args, **kwargs)
        with patch.object(I.os, 'open', side_effect=readonly): result = self.inventory()
        self.assertEqual(result['status'], 'PASS_EXISTING_REQUIRED_BYTES_ONLY')
        self.assertEqual(len(result['files']), 11)
        self.assertEqual(set(result['presentMatchingKeys']), set(I.REQUIRED))
        self.assertTrue(all(row['present'] and row['equal'] for row in result['files']))
        self.assertEqual(result['declaredRequiredBytes'], sum(self.pins[k]['bytes'] for k in I.REQUIRED))
        self.assertGreater(len(opens), 11)
        self.assertNotIn(MARKER.decode(), json.dumps(result))
        self.assertEqual(before, {p.name: (p.stat().st_ino, p.stat().st_size, p.stat().st_mtime_ns, p.stat().st_ctime_ns) for p in self.root.iterdir()})
        for key in ('qualificationRepeated', 'constructorsExecuted', 'networkUsed', 'GPGUsed', 'transferAllowed', 'executionAuthority'):
            self.assertFalse(result[key])

    def test_unverified_control_never_supplies_qualified_pins_or_zero_sizes(self):
        self.paths['qualificationReport'].write_bytes(b'FICTIONAL_MODIFIED_METADATA')
        result = self.inventory()
        self.assertEqual(result['status'], 'BLOCKED_EXISTING_FILES_OR_PINS')
        self.assertFalse(result['controlMetadataAccepted']['qualificationReport'])
        self.assertTrue(result['controlMetadataAccepted']['originalReception'])
        self.assertEqual(set(result['unresolvedMetadataKeys']), set(I.QUALIFIED))
        self.assertIsNone(result['declaredRequiredBytes'])
        for row in result['files']:
            if row['key'] in I.QUALIFIED:
                self.assertIsNone(row['bytes']); self.assertIsNone(row['sha256']); self.assertIsNone(row['present'])

    def test_missing_mismatched_and_symlink_files_remain_distinct(self):
        self.paths['qualifiedRows'].unlink()
        fixture = self.paths['qualifiedFixtures']; fixture.unlink(); fixture.symlink_to(self.paths['package'])
        with self.paths['currentReplacements'].open('ab') as stream: stream.write(b'CHANGED')
        result = self.inventory(); rows = {row['key']: row for row in result['files']}
        self.assertEqual(result['missingExistingKeys'], ['qualifiedRows'])
        self.assertFalse(rows['qualifiedRows']['present']); self.assertIsNone(rows['qualifiedRows']['observedBytes'])
        self.assertEqual(rows['qualifiedFixtures']['status'], 'REJECTED_NONREGULAR_FILE')
        self.assertTrue(rows['qualifiedFixtures']['present']); self.assertFalse(rows['qualifiedFixtures']['equal'])
        self.assertIsNone(rows['qualifiedFixtures']['observedSHA256'])
        self.assertTrue(rows['currentReplacements']['present']); self.assertFalse(rows['currentReplacements']['equal'])
        self.assertEqual(set(result['mismatchedExistingKeys']), {'qualifiedFixtures', 'currentReplacements'})
        self.assertFalse(result['transferAllowed'])

    def test_cli_requires_explicit_flag_and_never_echoes_unknown_arguments(self):
        output = io.StringIO()
        with patch('sys.stdout', output), patch.object(I, 'inventory_existing') as inventory:
            self.assertEqual(I.main([]), 0); inventory.assert_not_called()
        self.assertIn('BLOCKED_EXPLICIT_READONLY', output.getvalue())
        output = io.StringIO()
        with patch('sys.stdout', output), patch.object(I, 'inventory_existing') as inventory:
            self.assertEqual(I.main(['--inventory-existing-only', '--credential', MARKER.decode()]), 2)
            inventory.assert_not_called()
        self.assertNotIn(MARKER.decode(), output.getvalue())
        self.assertEqual(json.loads(output.getvalue())['status'], 'FAIL_EXISTING_INVENTORY_ARGUMENTS_OR_METADATA')


if __name__ == '__main__': unittest.main()
