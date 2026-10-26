#!/usr/bin/env python3
"""Small synthetic capsule cases. No real recipient, GPG, URL fetch or bundle."""
import base64
from contextlib import ExitStack, redirect_stdout, redirect_stderr
import copy
import datetime
import errno
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import types
import unittest
from unittest.mock import Mock, patch
import urllib.parse

PATH = Path(__file__).with_name('hetzner-native-stage-capsule.py')
with os.fdopen(os.open(PATH, os.O_RDONLY | os.O_NOFOLLOW | os.O_NOATIME), 'rb') as stream:
    SOURCE = stream.read()
m = types.ModuleType('synthetic_capsule_encoder')
m.__file__ = str(PATH)
exec(compile(SOURCE, str(PATH), 'exec'), m.__dict__)
WRITER = m.load_writer()
NOW, FP = 1792970000, 'A' * 40
SECRET = 'SYNTHETIC_SAS_SIGNATURE_NOT_FOR_LOGS'


def url(expiry=NOW + 600, index=1):
    stamp = datetime.datetime.fromtimestamp(expiry, datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    return 'https://' + m.HOST + '/files/00000000-0000-0000-0000-' + str(index).zfill(12) + '/raw?' + urllib.parse.urlencode(
        {'se': stamp, 'sp': 'r', 'sig': SECRET})


class CapsuleTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='stage-capsule-synthetic-')
        self.base = Path(self.temp.name)
        self.addCleanup(self.temp.cleanup)
        self.bundle_dir = self.base / 'bundle'
        self.bundle_dir.mkdir(mode=0o700)
        self.bundle_path = self.bundle_dir / 'BUNDLE_RESULT.SAFE.json'
        self.response_path, self.public_path, self.uri_path = [self.base / name for name in ('response.json', 'public.asc', 'uris.json')]
        self.output = self.base / 'capsule'
        self.response = {'operation': 'recipient', 'plan_sha256': m.PLAN_SHA256, 'payload_sha256': m.ROOT950_SHA256}
        self.response_sha = self.write_json(self.response_path, self.response)
        self.write(self.public_path, b'SYNTHETIC_PUBLIC_ONLY')
        self.bundle = {'schema': 'helmut-source-encrypted-bundle-v1', 'status': 'ENCRYPTED_SCOPE_COMPLETE',
            'scope_sha256': m.SCOPE_SHA256, 'recipient_fingerprint': FP,
            'recipient_response_sha256': self.response_sha, 'cipher': 'AES256', 'gpgCompression': 'none',
            'archive': 'tar+gzip', 'matchedRegularFiles': 1767, 'matchedRegularBytes': 2865680705,
            'matchedPythonMetadataEntries': 99, 'transferPerformed': False, 'targetRestored': False, 'nativeStarted': False,
            'cipherSHA256': 'a' * 64, 'cipherBytes': m.PART_BYTES + 100,
            'compressedTarSHA256': 'b' * 64, 'compressedTarBytes': 10000,
            'parts': [{'name': 'SOURCE.tar.gz.gpg.part0001', 'bytes': m.PART_BYTES, 'sha256': 'c' * 64},
                      {'name': 'SOURCE.tar.gz.gpg.part0002', 'bytes': 100, 'sha256': 'd' * 64}]}
        self.bundle_sha = self.write_json(self.bundle_path, self.bundle)
        self.uris = [{'index': index, 'url': url(index=index)} for index in (1, 2)]
        self.write_json(self.uri_path, self.uris)
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        self.stack.enter_context(patch.object(m.time, 'time', return_value=NOW))
        self.stack.enter_context(patch.object(m.subprocess, 'Popen', side_effect=AssertionError('no real GPG')))
        self.stack.enter_context(patch.object(m.subprocess, 'run', side_effect=AssertionError('no real GPG')))
        self.encrypted_inputs = []

    def write(self, path, raw):
        flags = os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW | (os.O_TRUNC if path.exists() else os.O_EXCL)
        fd = os.open(path, flags, 0o600)
        try:
            os.write(fd, raw)
        finally:
            os.close(fd)
        return m.sha(raw)

    def write_json(self, path, value):
        return self.write(path, json.dumps(value, sort_keys=True, separators=(',', ':')).encode())

    def read(self, path):
        return WRITER.read_noatime(str(path), 1024**2)

    def fake_encrypt(self, writer, directory, output, fingerprint, public, raw):
        self.encrypted_inputs.append(raw)
        self.assertEqual(fingerprint, FP)
        return b'SYNTHETIC_PGP_' + raw

    def encode(self, encryptor=None, validator=None):
        return m.encode_capsule(str(self.bundle_path), self.bundle_sha, str(self.response_path), self.response_sha,
            str(self.public_path), str(self.uri_path), str(self.output), encryptor=encryptor or self.fake_encrypt,
            recipient_validator=validator or (lambda *args: (FP, b'SYNTHETIC_PUBLIC_ONLY')))

    def test_default_noop_precedes_helper_and_input_reads(self):
        with patch.object(m, 'load_writer', side_effect=AssertionError('must not load')), redirect_stdout(io.StringIO()) as output:
            self.assertEqual(m.main([]), 2)
        self.assertIn('NOT_EXECUTED', output.getvalue())

    def test_exact_capsule_schema_hashes_part_binding_and_short_expiry_without_url_logs(self):
        with redirect_stdout(io.StringIO()) as stdout, redirect_stderr(io.StringIO()) as stderr:
            receipt = self.encode()
        capsule = json.loads(self.encrypted_inputs[0])
        self.assertEqual(set(capsule), {'schema', 'plan_sha256', 'scope_sha256', 'recipient_fingerprint', 'case_id',
            'created_unix', 'expires_unix', 'cipher_sha256', 'cipher_bytes', 'compressed_tar_sha256',
            'compressed_tar_bytes', 'parts'})
        self.assertEqual(capsule['schema'], 'helmut-private-drive-stage-capsule-v1')
        self.assertEqual(capsule['expires_unix'], NOW + 300)
        self.assertEqual(capsule['created_unix'], NOW)
        self.assertRegex(capsule['case_id'], '^[a-f0-9]{64}$')
        self.assertEqual(capsule['parts'], [{'index': index, 'bytes': part['bytes'], 'sha256': part['sha256'],
            'url': item['url']} for index, (part, item) in enumerate(zip(self.bundle['parts'], self.uris), 1)])
        encoded = self.read(self.output / 'STAGE_CAPSULE.PRIVATE.b64')
        self.assertEqual(m.sha(encoded), receipt['capsuleBase64SHA256'])
        self.assertEqual(len(encoded), receipt['capsuleBase64Bytes'])
        self.assertEqual(base64.b64decode(encoded, validate=True), b'SYNTHETIC_PGP_' + self.encrypted_inputs[0])
        self.assertEqual(stdout.getvalue() + stderr.getvalue(), '')
        for path in self.output.iterdir():
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            self.assertNotIn(SECRET.encode(), self.read(path))
            self.assertNotIn(b'https://', self.read(path))
        self.assertEqual(self.output.stat().st_mode & 0o777, 0o700)

    def test_capsule_expiry_uses_earliest_url_and_requires_initial_120_seconds(self):
        self.uris[0]['url'] = url(NOW + 140)
        self.write_json(self.uri_path, self.uris)
        self.encode()
        self.assertEqual(json.loads(self.encrypted_inputs[0])['expires_unix'], NOW + 140)
        with self.assertRaisesRegex(m.Stop, '^URI_LIFETIME$'):
            m.uri_expiry(url(NOW + 119), NOW)
        self.assertEqual(m.uri_expiry(url(NOW + 120), NOW), NOW + 120)

    def test_uri_authority_path_sas_and_expiry_are_strict_without_fetch(self):
        valid = url()
        invalid = [valid.replace('https://', 'http://'), valid.replace(m.HOST, 'foreign.invalid'),
            valid.replace(m.HOST, m.HOST + ':444'), valid.replace(m.HOST, 'user@' + m.HOST),
            valid.replace('/raw?', '/raw/extra?'), valid.replace('/files/', '/files/%2e%2e/'),
            valid + '#fragment', valid + '\n', valid.replace('/raw?', '\\raw?'),
            valid + '&se=2026-10-26T00%3A00%3A00Z', valid.replace(SECRET, ''),
            valid.replace('se=', 'wrong='), valid.replace('2026-', 'nonsense-')]
        for value in invalid:
            with self.subTest(kind=value[:16]):
                with self.assertRaises((m.Stop, ValueError)):
                    m.uri_expiry(value, NOW)
        self.assertGreater(m.uri_expiry(valid.replace(m.HOST, m.HOST + ':443'), NOW), NOW)

    def test_uri_list_exact_indices_and_field_count(self):
        for value in ([{'index': 0, 'url': url()}, self.uris[1]],
                      [{'index': True, 'url': url()}, self.uris[1]],
                      [{'index': 1, 'url': url(), 'private': SECRET}, self.uris[1]], self.uris[:1]):
            with self.assertRaises(m.Stop):
                m.capsule_value(self.bundle, value, FP, NOW)

    def test_bundle_pin_scope_count_fingerprint_and_sizes_must_match(self):
        cases = [('scope_sha256', '0' * 64), ('matchedRegularFiles', 1766),
            ('matchedRegularBytes', 2865680704), ('matchedPythonMetadataEntries', 98),
            ('recipient_fingerprint', 'B' * 40), ('recipient_response_sha256', '0' * 64),
            ('cipherBytes', m.MAX_CIPHER_BYTES + 1), ('compressedTarBytes', 0),
            ('status', 'PARTIAL'), ('nativeStarted', True), ('cipherSHA256', 'A' * 64)]
        for field, value in cases:
            altered = copy.deepcopy(self.bundle)
            altered[field] = value
            expected_sha = self.write_json(self.bundle_path, altered)
            with self.subTest(field=field):
                with self.assertRaises(m.Stop):
                    m.bundle_metadata(WRITER, str(self.bundle_path), expected_sha, FP, self.response_sha)
        self.write_json(self.bundle_path, self.bundle)
        with self.assertRaisesRegex(m.Stop, '^BUNDLE_RECEIPT_PIN$'):
            m.bundle_metadata(WRITER, str(self.bundle_path), '0' * 64, FP, self.response_sha)

    def test_bundle_incomplete_pending_and_error_block_even_complete_result(self):
        for index, name in enumerate(('BUNDLE_RESULT.PENDING.SAFE.json', 'BUNDLE_FIRST_ERROR.PRIVATE.json',
                                      'GPG_FIRST_ERROR.PRIVATE.json')):
            directory = self.base / ('failed-source-' + str(index))
            directory.mkdir(mode=0o700)
            path = directory / 'BUNDLE_RESULT.SAFE.json'
            self.write_json(path, self.bundle)
            self.write(directory / name, b'{}')
            with self.assertRaisesRegex(m.Stop, '^BUNDLE_INCOMPLETE_OR_FAILED$'):
                m.bundle_metadata(WRITER, str(path), self.bundle_sha, FP, self.response_sha)

    def test_part_indices_sizes_hashes_and_64_part_bound(self):
        for mutation in ('too-many', 'oversize', 'short-middle', 'name', 'hash', 'total'):
            value = copy.deepcopy(self.bundle)
            if mutation == 'too-many':
                value['parts'] *= 33
            elif mutation == 'oversize':
                value['parts'][0]['bytes'] += 1
            elif mutation == 'short-middle':
                value['parts'][0]['bytes'] -= 1
            elif mutation == 'name':
                value['parts'][0]['name'] = '../part'
            elif mutation == 'hash':
                value['parts'][0]['sha256'] = 'x' * 64
            else:
                value['cipherBytes'] += 1
            pin = self.write_json(self.bundle_path, value)
            with self.subTest(mutation=mutation):
                with self.assertRaises(m.Stop):
                    m.bundle_metadata(WRITER, str(self.bundle_path), pin, FP, self.response_sha)

    def test_wrong_plan_or_root950_payload_rejected_before_encryption(self):
        for index, field in enumerate(('plan_sha256', 'payload_sha256')):
            self.output = self.base / ('root-mismatch-' + str(index))
            value = dict(self.response)
            value[field] = '0' * 64
            self.response_sha = self.write_json(self.response_path, value)
            with self.assertRaisesRegex(m.Stop, '^ROOT950_RECIPIENT_BINDING$'):
                self.encode()
            self.assertEqual(self.encrypted_inputs, [])

    def test_wrong_accepted_fingerprint_never_reaches_encryptor(self):
        with self.assertRaisesRegex(m.Stop, '^BUNDLE_QUALIFICATION$'):
            self.encode(validator=lambda *args: ('B' * 40, b'SYNTHETIC_PUBLIC_ONLY'))
        self.assertEqual(self.encrypted_inputs, [])

    def test_json_and_encrypted_base64_bounds_keep_no_success_receipt(self):
        with patch.object(m, 'MAX_JSON', 1000):
            with self.assertRaisesRegex(m.Stop, '^CAPSULE_JSON_SIZE$'):
                self.encode()
        self.output = self.base / 'oversized-encrypted'
        with self.assertRaisesRegex(m.Stop, '^CAPSULE_ENCRYPTED_SIZE$'):
            self.encode(encryptor=lambda *args: b'x' * (m.MAX_ENCRYPTED + 1))
        self.assertFalse((self.output / 'CAPSULE_RECEIPT.SAFE.json').exists())

    def test_source_or_encryptor_failure_retains_first_private_error_without_plaintext_urls(self):
        def fail(*args):
            raise OSError(errno.ENOSPC, url())
        with self.assertRaises(OSError):
            self.encode(encryptor=fail)
        path = self.output / 'CAPSULE_FIRST_ERROR.PRIVATE.json'
        before = self.read(path)
        self.assertEqual(json.loads(before)['errno'], errno.ENOSPC)
        self.assertNotIn(SECRET.encode(), before)
        self.assertNotIn(b'https://', before)
        with self.assertRaises(FileExistsError):
            self.encode()
        self.assertEqual(self.read(path), before)

    def test_capsule_gpg_arguments_force_aes256_mdc_zlib_with_bounded_mock_pipes(self):
        self.output.mkdir(mode=0o700)
        directory = os.open(self.output, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_NOATIME)
        input_read, input_write = os.pipe()
        cipher_read, cipher_write = os.pipe()
        error_read, error_write = os.pipe()
        os.write(cipher_write, b'SYNTHETIC_ENCRYPTED_METADATA')
        os.close(cipher_write)
        os.close(error_write)
        process = types.SimpleNamespace(stdin=os.fdopen(input_write, 'wb', buffering=0),
            stdout=os.fdopen(cipher_read, 'rb', buffering=0), stderr=os.fdopen(error_read, 'rb', buffering=0),
            wait=Mock(return_value=0), pid=123456)
        try:
            with patch.object(WRITER, 'public_import') as importing, \
                    patch.object(m.subprocess, 'Popen', return_value=process) as opening:
                encrypted = m.encrypt_capsule(WRITER, directory, str(self.output), FP, b'SYNTHETIC_PUBLIC_ONLY', b'{"synthetic":true}')
            self.assertEqual(encrypted, b'SYNTHETIC_ENCRYPTED_METADATA')
            args = opening.call_args.args[0]
            self.assertIn('--rfc4880', args)
            self.assertIn('--force-mdc', args)
            self.assertEqual(args[args.index('--cipher-algo') + 1], 'AES256')
            self.assertEqual(args[args.index('--compress-algo') + 1], 'ZLIB')
            self.assertEqual(args[args.index('--recipient') + 1], FP)
            self.assertNotIn('--import-ownertrust', args)
            self.assertEqual(importing.call_args.args[1], b'SYNTHETIC_PUBLIC_ONLY')
            self.assertEqual(os.read(input_read, 1024), b'{"synthetic":true}')
        finally:
            os.close(input_read)
            os.close(directory)

    def test_gpg_failure_keeps_partial_cipher_and_private_redacted_stderr_before_cleanup(self):
        self.output.mkdir(mode=0o700)
        directory = os.open(self.output, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_NOATIME)
        input_read, input_write = os.pipe()
        cipher_read, cipher_write = os.pipe()
        error_read, error_write = os.pipe()
        os.write(cipher_write, b'SYNTHETIC_PARTIAL_CIPHER')
        os.close(cipher_write)
        raw_error = ('SYNTHETIC_TOOL_ERROR ' + url() + '\n').encode()
        os.write(error_write, raw_error)
        os.close(error_write)
        process = types.SimpleNamespace(stdin=os.fdopen(input_write, 'wb', buffering=0),
            stdout=os.fdopen(cipher_read, 'rb', buffering=0), stderr=os.fdopen(error_read, 'rb', buffering=0),
            wait=Mock(return_value=7), pid=123456)
        events, real_write = [], WRITER.write_once
        def write(*args, **kwargs):
            events.append('error')
            return real_write(*args, **kwargs)
        try:
            with patch.object(WRITER, 'public_import'), patch.object(m.subprocess, 'Popen', return_value=process), \
                    patch.object(WRITER, 'write_once', side_effect=write), \
                    patch.object(WRITER, 'stop_process', side_effect=lambda process: events.append('stop')):
                with self.assertRaisesRegex(m.Stop, '^CAPSULE_GPG_FAILED$'):
                    m.encrypt_capsule(WRITER, directory, str(self.output), FP, b'SYNTHETIC_PUBLIC_ONLY', b'{}')
            self.assertEqual(events, ['error', 'stop'])
            record = json.loads(self.read(self.output / 'CAPSULE_GPG_FIRST_ERROR.PRIVATE.json'))
            self.assertEqual(record['returncode'], 7)
            self.assertEqual(record['stderrSHA256'], m.sha(raw_error))
            prefix = base64.b64decode(record['stderrPrefixBase64'])
            self.assertNotIn(SECRET.encode(), prefix)
            self.assertNotIn(b'https://', prefix)
            self.assertIn(b'REDACTED_URI', prefix)
            self.assertEqual(self.read(self.output / 'STAGE_CAPSULE.PARTIAL.PRIVATE.pgp'), b'SYNTHETIC_PARTIAL_CIPHER')
        finally:
            os.close(input_read)
            os.close(directory)


if __name__ == '__main__':
    unittest.main(verbosity=2)
