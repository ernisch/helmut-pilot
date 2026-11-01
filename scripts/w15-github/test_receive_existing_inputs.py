"""Fake URL tokens, HTTP streams and GPG only; no originals, keys or network."""
import base64
import contextlib
from datetime import datetime, timedelta, timezone
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

SPEC = importlib.util.spec_from_file_location('w15_receive_existing_test', Path(__file__).with_name('receive_existing_inputs.py'))
E = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(E)
COMMIT = 'a' * 40
NOW = datetime(2026, 10, 29, 12, 0, tzinfo=timezone.utc)
URLS = [f'https://fake-part-{n}.oaiusercontent.com/cipher?token=FICTIONAL-{n}' for n in range(1, 16)]


def index(now=NOW):
    return {'schema': 'helmut-w15-private-cipher-url-index/1', 'expectedCommit': COMMIT,
            'createdAtUTC': now.isoformat(), 'expiresAtUTC': (now + timedelta(minutes=20)).isoformat(),
            'parts': [{'index': n, 'url': url} for n, url in enumerate(URLS, 1)]}


class Response:
    def __init__(self, url, body, *, status=200, length=None):
        self.url, self.body, self.pos, self.status = url, body, 0, status
        self.headers = {'Content-Length': str(len(body) if length is None else length)}
        self.fp = SimpleNamespace(raw=SimpleNamespace(_sock=Mock()))
    def __enter__(self): return self
    def __exit__(self, *args): return False
    def geturl(self): return self.url
    def read1(self, size):
        block = self.body[self.pos:self.pos + size]; self.pos += len(block)
        if self.pos == len(self.body): self.fp = None  # Real HTTPResponse does this at Content-Length.
        return block


class ExistingReceiveChecks(unittest.TestCase):
    def test_index_strict_context_lifetime_order_and_host(self):
        urls, expires = E.url_index(json.dumps(index()), COMMIT, NOW)
        self.assertEqual(urls, URLS); self.assertEqual(expires, NOW + timedelta(minutes=20))
        for change in ({'expectedCommit': 'b' * 40}, {'createdAtUTC': (NOW + timedelta(seconds=61)).isoformat()},
                       {'expiresAtUTC': NOW.isoformat()}, {'expiresAtUTC': (NOW + timedelta(minutes=31)).isoformat()},
                       {'createdAtUTC': (NOW - timedelta(minutes=31)).isoformat()}, {'extra': 'not allowed'}):
            with self.assertRaises(Exception): E.url_index(json.dumps({**index(), **change}), COMMIT, NOW)
        for url in ('http://x.oaiusercontent.com/a', 'https://evil.example/a', 'https://x.oaiusercontent.com.evil/a',
                    'https://user:pass@x.oaiusercontent.com/a', 'https://x.oaiusercontent.com:444/a',
                    'https://x.oaiusercontent.com/a#fragment', 'https://x.oaiusercontent.com/a\nSECRET'):
            value = index(); value['parts'][0]['url'] = url
            with self.assertRaises(Exception): E.url_index(json.dumps(value), COMMIT, NOW)
        for mutation in ('reorder', 'duplicate', 'missing'):
            value = index()
            if mutation == 'reorder': value['parts'][0], value['parts'][1] = value['parts'][1], value['parts'][0]
            if mutation == 'duplicate': value['parts'][1]['url'] = value['parts'][0]['url']
            if mutation == 'missing': value['parts'].pop()
            with self.assertRaises(Exception): E.url_index(json.dumps(value), COMMIT, NOW)

    def fake_parts(self):
        data = [b'fictional-part-' + str(n).encode() for n in range(1, 16)]
        pins = [{'index': n, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()} for n, raw in enumerate(data, 1)]
        return data, pins

    def download(self, root, data, pins, mutate=None):
        calls = []
        def open_(request, timeout):
            position = len(calls); calls.append(request)
            self.assertEqual(request.get_method(), 'GET'); self.assertGreater(timeout, 0); self.assertLessEqual(timeout, 60)
            response = Response(request.full_url, data[position])
            return mutate(response, position) if mutate else response
        opener = Mock(); opener.open.side_effect = open_
        with patch.object(E.urllib.request, 'build_opener', return_value=opener) as build, \
                patch.object(E, 'TOTAL', sum(map(len, data))), \
                patch.object(E, 'CIPHER_SHA', hashlib.sha256(b''.join(data)).hexdigest()):
            result = E.download(root, URLS, datetime.now(timezone.utc) + timedelta(minutes=10), pins)
        self.assertEqual(len(build.call_args.args), 1)
        self.assertIsInstance(build.call_args.args[0], E.NoRedirect)
        return result, calls

    def test_get_streams_match_parts_and_complete_readback_without_overwrite(self):
        data, pins = self.fake_parts()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); result, calls = self.download(root, data, pins)
            self.assertEqual(result.read_bytes(), b''.join(data)); self.assertEqual(len(calls), 15)
            self.assertEqual([call.full_url for call in calls], URLS)
            for file in root.iterdir(): self.assertEqual(file.stat().st_mode & 0o777, 0o600)
            with self.assertRaises(E.DownloadRejected): self.download(root, data, pins)
            self.assertEqual(E.PHASE, 'download-io')

    def test_bad_status_hash_or_truncation_stops_without_retry_and_retains_private_partial(self):
        data, pins = self.fake_parts()
        def status(response, n): response.status = 302; return response
        def changed(response, n): response.body = b'X' * len(response.body); return response
        def short(response, n): response.body = response.body[:-1]; return response
        for mutate in (status, changed, short):
            with tempfile.TemporaryDirectory() as tmp:
                with self.assertRaises(Exception): self.download(Path(tmp), data, pins, mutate)
                self.assertTrue((Path(tmp) / 'part-01.PRIVATE.pgp').exists())
                self.assertFalse((Path(tmp) / 'part-02.PRIVATE.pgp').exists())
        with self.assertRaises(ValueError): E.NoRedirect().redirect_request(None, None, 302, '', {}, URLS[0])

    def test_expiry_or_global_deadline_blocks_http(self):
        data, pins = self.fake_parts()
        with tempfile.TemporaryDirectory() as tmp, patch.object(E.urllib.request, 'build_opener') as opener:
            with self.assertRaises(ValueError): E.download(Path(tmp), URLS, datetime.now(timezone.utc) - timedelta(seconds=1), pins)
            opener.return_value.open.assert_not_called()
        with tempfile.TemporaryDirectory() as tmp, patch.object(E.urllib.request, 'build_opener') as opener, \
                patch.object(E.time, 'monotonic', side_effect=[0, 301, 301]):
            with self.assertRaises(ValueError): E.download(Path(tmp), URLS, datetime.now(timezone.utc) + timedelta(minutes=10), pins)
            opener.return_value.open.assert_not_called()

    def run_receiver(self, root, *, available=1024 ** 3, receipt_sha=None):
        binding = {'exactCommit': COMMIT, 'runId': '40855525798', 'runAttempt': 1}
        env = {E.INDEX_NAME: json.dumps(index(datetime.now(timezone.utc))),
               E.V.KEY_NAME: base64.b64encode(b'fake-protected-key').decode(), E.V.PASS_NAME: 'fake-passphrase'}
        relocated = Mock(); relocated.safe_summary.return_value = {'verifiedFiles': 12, 'verifiedBytes': 242570240,
                                                                   'checkoutCommit': COMMIT, 'transferContext': E.SOURCE}
        def crypto(*args, **kwargs):
            for name in (E.INDEX_NAME, E.V.KEY_NAME, E.V.PASS_NAME): self.assertNotIn(name, E.os.environ)
            return ('sec:u::::::::\nfpr:::::::::' + E.V.FINGERPRINT + ':\n').encode()
        with patch.dict(E.os.environ, env, clear=True), patch.object(E, 'source_binding', return_value=binding), \
                patch.object(E, 'projection', return_value=[]), patch.object(E.V, 'private_root', return_value=root), \
                patch.object(E.os, 'statvfs', return_value=SimpleNamespace(f_bavail=available, f_frsize=1)), \
                patch.object(E.A.resource, 'setrlimit'), patch.object(E.A, '_run', side_effect=crypto) as gpg, \
                patch.object(E.A, '_binary', return_value='/usr/bin/gpgconf'), \
                patch.object(E.N, 'check_event', return_value=1234), \
                patch.object(E.N, 'decrypt_index', return_value=json.dumps(index(datetime.now(timezone.utc)))), \
                patch.object(E.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0)), \
                patch.object(E, 'download', return_value=root / 'cipher.PRIVATE.gpg') as download, \
                patch.object(E.R, 'receive', return_value={'sealedManifestSHA256': receipt_sha or E.SEALED_SHA}) as receive, \
                patch.object(E.IP, 'verify_received', return_value=relocated) as verify:
            result = E.receive_existing(COMMIT, str(root))
        return result, gpg, download, receive, verify

    def test_historical_source_context_stays_distinct_from_new_consumer_commit(self):
        with tempfile.TemporaryDirectory() as tmp:
            result, gpg, download, receive, verify = self.run_receiver(Path(tmp))
            self.assertEqual(receive.call_args.kwargs['exact_commit'], E.SOURCE['exactCommit'])
            self.assertEqual(receive.call_args.kwargs['run_id'], E.SOURCE['runId'])
            self.assertNotEqual(receive.call_args.kwargs['exact_commit'], COMMIT)
            self.assertEqual(verify.call_args.kwargs['checkout_commit'], COMMIT)
            self.assertEqual(verify.call_args.kwargs['expected_transfer_context'], E.SOURCE)
            self.assertEqual(result['verifiedFiles'], 12); self.assertTrue(result['relocationVerified'])
            for flag in ('executionAuthority', 'fullRestoreAccepted', 'databaseStarted', 'commonLifetimeMemoryAccepted',
                         'end500Acceptance', 'mock500Acceptance', 'controllerStarted'):
                self.assertFalse(result[flag])
            self.assertNotIn('fake-passphrase', json.dumps(result)); self.assertNotIn('FICTIONAL-', json.dumps(result))

    def test_disk_admission_and_sealed_context_mismatch_block(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(ValueError): self.run_receiver(Path(tmp), available=1024 ** 3 - 1)
            self.assertFalse((Path(tmp) / 'gnupg').exists())
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(ValueError): self.run_receiver(Path(tmp), receipt_sha='b' * 64)
            self.assertEqual(E.PHASE, 'authenticated-reception')

    def test_fixed_public_errors_never_echo_token_path_or_exception(self):
        def fail(*args):
            E.phase('download'); raise ValueError(URLS[0] + '/private/SECRET')
        with patch.object(E, 'receive_existing', side_effect=fail), contextlib.redirect_stdout(io.StringIO()) as out:
            self.assertEqual(E.main(['--receive-existing-inputs-only', '--expected-commit', COMMIT, '--runner-temp', '/fake/private']), 1)
        result = json.loads(out.getvalue())
        self.assertEqual(result['phase'], 'download')
        for private in ('FICTIONAL-', 'SECRET', '/fake', 'https:'): self.assertNotIn(private, out.getvalue())


if __name__ == '__main__': unittest.main()
