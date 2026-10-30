"""Focused synthetic gzip/USTAR/file checks. No keys, HTTP or original bytes."""
import sys
sys.dont_write_bytecode = True
import copy
import gzip
import hashlib
import importlib.util
import io
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('w15_mock_original_archive_tested', Path(__file__).with_name('mock500_original_archive.py'))
M = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(M)
SHA = lambda raw: hashlib.sha256(raw).hexdigest()


class FakeGPG:
    def __init__(self, raw, code=0, *, cleanup_failure=False, timeout=False):
        self.stdout, self.code = io.BytesIO(raw), code
        self.cleanup_failure, self.timeout = cleanup_failure, timeout
        self.waits, self.killed, self.finished = 0, False, False

    def wait(self, timeout=None):
        self.waits += 1
        if self.cleanup_failure or (self.timeout and self.waits == 1):
            raise subprocess.TimeoutExpired('fictional-gpg', 0)
        self.finished = True
        return self.code

    def poll(self): return self.code if self.finished else None

    def kill(self):
        self.killed = True
        if self.cleanup_failure: raise OSError('FICTIONAL PRIVATE DETAIL MUST NOT LEAVE')
        self.finished = True


class ArchiveChecks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='w15-fictional-gzip-reception-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name); self.root.chmod(0o700)
        self.home = self.root / 'home'; self.home.mkdir(mode=0o700)
        self.phrase = self.root / 'phrase.PRIVATE'; self.write(self.phrase, b'FICTIONAL NOT A REAL SECRET')
        self.cipher = self.root / 'cipher.PRIVATE.gpg'; self.write(self.cipher, b'FICTIONAL NOT A REAL CIPHER')
        self.data = {row[0]: ('FICTIONAL-' + key).encode() for key, row in M.FILES.items()}
        self.manifest = b'{"origin":"/historical/provenance/only","private":"fictional"}'
        self.data['MANIFEST.json'] = self.manifest
        self.pins = {key: (row[0], len(self.data[row[0]]), SHA(self.data[row[0]])) for key, row in M.FILES.items()}
        self.total = sum(len(raw) for name, raw in self.data.items() if name != 'MANIFEST.json')
        self.args = {'destination': str(self.root / 'received'), 'private_home': str(self.home),
                     'passphrase_file': str(self.phrase), 'guard': lambda: None}
        self.status = ('[GNUPG:] DECRYPTION_KEY ' + 'A' * 40 + ' ' + M.FINGERPRINT + ' u\n'
                       '[GNUPG:] DECRYPTION_OKAY\n[GNUPG:] GOODMDC\n').encode()
        self.created = []

    @staticmethod
    def write(path, raw):
        path.write_bytes(raw); path.chmod(0o600)

    def tar(self, entries=None, *, fmt=tarfile.USTAR_FORMAT):
        raw = io.BytesIO()
        with tarfile.open(fileobj=raw, mode='w', format=fmt) as archive:
            for name, data, kind, link in entries or [(name, raw, tarfile.REGTYPE, '') for name, raw in self.data.items()]:
                entry = tarfile.TarInfo(name); entry.size = len(data); entry.type = kind; entry.linkname = link
                archive.addfile(entry, io.BytesIO(data))
        return raw.getvalue()

    def run_receive(self, raw=None, *, code=0, status=None, cleanup_failure=False, timeout=False, readback=None):
        raw = gzip.compress(self.tar()) if raw is None else raw
        def popen(*args, **kwargs):
            command = args[0]; fd = int(command[command.index('--status-fd') + 1])
            os.write(fd, self.status if status is None else status)
            process = FakeGPG(raw, code, cleanup_failure=cleanup_failure, timeout=timeout)
            self.created.append(process); return process
        original_verify = M.S._verify_file
        with patch.multiple(M, FILES=self.pins, TOTAL=self.total,
                MANIFEST={'bytes': len(self.manifest), 'sha256': SHA(self.manifest)},
                CIPHER={'bytes': self.cipher.stat().st_size, 'sha256': SHA(self.cipher.read_bytes())}), \
             patch.object(M.V, 'primary'), \
             patch.object(M.subprocess, 'run', return_value=SimpleNamespace(returncode=0, stdout=b'FICTIONAL PUBLIC LIST')), \
             patch.object(M.subprocess, 'Popen', side_effect=popen), \
             patch.object(M.S, '_verify_file', side_effect=readback or original_verify):
            return M.receive(str(self.cipher), **self.args)

    def rejected(self, raw, phase=None, **kwargs):
        with self.assertRaises(M.ArchiveReceiveError) as got:
            self.run_receive(raw, **kwargs)
        self.assertEqual(str(got.exception), 'MOCK500_ORIGINAL_ARCHIVE_REJECTED')
        if phase: self.assertEqual(got.exception.phase, phase)
        return got.exception

    def test_complete_format_manifest_all11_hashes_and_private_readback(self):
        result = self.run_receive()
        self.assertEqual(set(result['asset_paths']), set(self.pins))
        receipt = result['safe_receipt']
        self.assertEqual((receipt['verifiedFiles'], receipt['verifiedBytes']), (11, self.total))
        self.assertTrue(receipt['gpgIntegrityVerified'] and receipt['fullPrivateReadbackVerified'])
        self.assertFalse(receipt['executionAuthority'] or receipt['testStarted'] or receipt['mock500Acceptance'])
        destination = Path(self.args['destination'])
        self.assertEqual(destination.stat().st_mode & 0o777, 0o700)
        for name, raw in self.data.items():
            self.assertEqual((destination / name).read_bytes(), raw)
            self.assertEqual((destination / name).stat().st_mode & 0o777, 0o600)
        self.assertTrue(self.created[0].finished and self.created[0].stdout.closed)
        self.assertFalse((self.root / 'historical').exists())

    def test_invalid_members_are_rejected_before_writing_their_paths(self):
        variants = [('absolute', '/escape', tarfile.REGTYPE, ''), ('traversal', '../escape', tarfile.REGTYPE, ''),
                    ('directory', 'folder', tarfile.DIRTYPE, ''), ('symlink', 'link', tarfile.SYMTYPE, '../escape'),
                    ('hardlink', 'link', tarfile.LNKTYPE, '/escape'), ('pax', 'pax', tarfile.XHDTYPE, ''),
                    ('gnu', 'gnu', tarfile.GNUTYPE_LONGNAME, ''), ('extra', 'UNEXPECTED', tarfile.REGTYPE, '')]
        for label, name, kind, link in variants:
            with self.subTest(label=label):
                self.args['destination'] = str(self.root / ('rejected-' + label))
                entries = [(name, b'x', kind, link)] + [(n, b, tarfile.REGTYPE, '') for n, b in self.data.items()]
                self.rejected(gzip.compress(self.tar(entries)), 'archive')
                self.assertEqual(list(Path(self.args['destination']).iterdir())[0].name, 'GPG.PRIVATE.status')

    def test_duplicate_missing_size_and_all_file_hash_mismatches(self):
        rows = [(name, raw, tarfile.REGTYPE, '') for name, raw in self.data.items()]
        cases = [('duplicate', rows[:1] + rows), ('missing', rows[:-1]),
                 ('wrong-size', [(rows[0][0], rows[0][1] + b'x', tarfile.REGTYPE, '')] + rows[1:])]
        for label, entries in cases:
            with self.subTest(label=label):
                self.args['destination'] = str(self.root / label)
                self.rejected(gzip.compress(self.tar(entries)), 'archive')
        for index, row in enumerate(rows):
            with self.subTest(hashOf=row[0]):
                self.args['destination'] = str(self.root / ('hash-' + str(index)))
                changed = list(rows); changed[index] = (row[0], b'X' * len(row[1]), tarfile.REGTYPE, '')
                self.rejected(gzip.compress(self.tar(changed)), 'manifest' if row[0] == 'MANIFEST.json' else 'files')

    def test_gzip_crc_truncation_trailing_and_concatenated_members(self):
        good = gzip.compress(self.tar())
        cases = [('rawtar', self.tar()), ('truncated', good[:-4]), ('crc', good[:-8] + b'0000' + good[-4:]),
                 ('trailing', good + b'EXTRA'), ('concatenated', good + gzip.compress(b''))]
        for label, raw in cases:
            with self.subTest(label=label):
                self.args['destination'] = str(self.root / label)
                self.rejected(raw, 'gzip')

    def test_tar_magic_checksum_missing_eof_and_nonzero_tail(self):
        tar = self.tar()
        body_end = sum(512 + ((len(raw) + 511) // 512) * 512 for raw in self.data.values())
        cases = [('magic', tar[:257] + b'BAD!' + tar[261:]), ('checksum', b'X' + tar[1:]),
                 ('missing-end', tar[:body_end]), ('one-end', tar[:body_end+512]),
                 ('nonzero-tail', tar[:-1] + b'X'), ('gnu-format', self.tar(fmt=tarfile.GNU_FORMAT))]
        for label, raw in cases:
            with self.subTest(label=label):
                self.args['destination'] = str(self.root / label)
                self.rejected(gzip.compress(raw), 'archive')

    def test_gpg_failure_missing_integrity_wrong_recipient_and_error_status(self):
        variants = [('exit', 2, self.status), ('mdc', 0, self.status.replace(b'[GNUPG:] GOODMDC\n', b'')),
                    ('recipient', 0, self.status.replace(M.FINGERPRINT.encode(), b'B' * 40)),
                    ('error', 0, self.status + b'[GNUPG:] ERROR fictional\n'), ('oversize', 0, b'x' * (M.MAX_STATUS + 1))]
        for label, code, status in variants:
            with self.subTest(label=label):
                self.args['destination'] = str(self.root / label)
                self.rejected(None, 'integrity', code=code, status=status)

    def test_first_archive_error_survives_cleanup_failure(self):
        error = self.rejected(gzip.compress(b'not ustar'), 'archive', cleanup_failure=True)
        self.assertEqual(error.process_stopped, 'UNKNOWN')
        self.assertTrue(self.created[0].killed)

    def test_timeout_stops_process_and_never_returns_paths(self):
        error = self.rejected(None, 'integrity', timeout=True)
        self.assertEqual(error.process_stopped, 'PASS')
        self.assertTrue(self.created[0].finished)

    def test_full_readback_failure_cannot_report_pass(self):
        def changed(*args, **kwargs): raise OSError('FICTIONAL PRIVATE DETAIL MUST NOT LEAVE')
        self.rejected(None, 'readback', readback=changed)

    def test_existing_destination_and_symlink_not_overwritten(self):
        destination = Path(self.args['destination']); destination.mkdir(mode=0o700)
        keep = destination / 'keep'; keep.write_bytes(b'PRESERVED')
        self.rejected(None, 'destination')
        self.assertEqual(keep.read_bytes(), b'PRESERVED')
        destination2 = self.root / 'alias'; destination2.symlink_to(destination, target_is_directory=True)
        self.args['destination'] = str(destination2)
        self.rejected(None, 'destination')
        self.assertEqual(keep.read_bytes(), b'PRESERVED')

    def test_cipher_mismatch_prevents_gpg_start(self):
        original_hash = M.S._hash_fd
        def wrong(fd, guard=None): return (0, '0' * 64)
        with patch.object(M.S, '_hash_fd', side_effect=wrong): self.rejected(None, 'cipher')
        self.assertEqual(self.created, [])

    def test_expansion_bound_and_guard_failure(self):
        self.rejected(gzip.compress(b'x' * (128 * 1024)), 'gzip')
        self.args['destination'] = str(self.root / 'guard-failure')
        def stopped(): raise RuntimeError('FICTIONAL PRIVATE DETAIL MUST NOT LEAVE')
        self.args['guard'] = stopped
        self.rejected(None, 'arguments')
        self.assertFalse(Path(self.args['destination']).exists())


if __name__ == '__main__': unittest.main()
