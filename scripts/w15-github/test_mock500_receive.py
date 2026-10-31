"""Four focused fictional receive checks; no HTTP, GPG, originals or qualifier."""
import sys
sys.dont_write_bytecode = True
import base64
import copy
from datetime import datetime, timedelta, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

HERE = Path(__file__).absolute().parent
SPEC = importlib.util.spec_from_file_location('w15_mock500_receive_tested', HERE / 'mock500_receive.py')
M = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(M)
SPEC = importlib.util.spec_from_file_location('w15_existing_response_fixture_only', HERE / 'test_receive_existing_inputs.py')
FIXTURES = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(FIXTURES)
COMMIT = 'a' * 40


def fixture():
    now = datetime.now(timezone.utc)
    data = {key: b'FICTIONAL-' + key.encode() for key in M.ASSET_KEYS}
    pins = {key: {'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()} for key, raw in data.items()}
    pins['originalReception'] = {'bytes': 12357, 'sha256': '2cee6eb467342cabbe28db958ac00cc6cd9699622c3a772796d68d2d6adb97f1'}
    record = {'schema': 'helmut-w15-mock500-static-input-binding/1', 'scope': M.SCOPE,
        'status': 'PASS_INDEPENDENT_MOCK500_INPUT_BINDING_ONLY', 'exactCommit': COMMIT,
        'assets': pins, 'executionAuthority': False, 'testStarted': False,
        'sourceComparison': {'status': 'PASS_INDEPENDENT_ORIGINAL16_CURRENT2_SOURCE_COMPARISON',
            'originalSourceChecks': 16, 'currentSourceChecks': 2,
            'qualificationSHA256': pins['qualificationReport']['sha256'], 'sourceDatesRewritten': False, 'originalsUnchanged': True}}
    binding_raw = M.canonical(record)
    files = [{'path': 'assets/' + key + '.PRIVATE', **pins[key]} for key in sorted(data)]
    source = {'schema': 'helmut-w15-backup-context/1', 'scope': M.SCOPE,
        'nonce': '26d5a413-5ca7-415c-a412-62fc45b561c8', 'exactCommit': 'b' * 40, 'runId': '20261029123456',
        'runAttempt': 1, 'inputManifestSHA': hashlib.sha256(M.canonical(files)).hexdigest(),
        'recipientFingerprint': M.V.FINGERPRINT, 'executionAuthority': False}
    manifest = {'version': 1, **{key: source[key] for key in ('exactCommit', 'runId', 'runAttempt', 'inputManifestSHA', 'recipientFingerprint')}, 'files': files}
    cipher = [b'FICTIONAL_ASSET_PART_A', b'FICTIONAL_ASSET_PART_B']
    value = {'schema': 'helmut-w15-mock500-private-url-index/1', 'expectedCommit': COMMIT,
        'createdAtUTC': now.isoformat(), 'expiresAtUTC': (now + timedelta(minutes=20)).isoformat(),
        'original': FIXTURES.index(now), 'inputBinding': binding_raw.decode(),
        'assets': {'sourceContext': source, 'manifestSHA256': hashlib.sha256(M.canonical(manifest) + b'\n').hexdigest(),
            'cipherBytes': sum(map(len, cipher)), 'cipherSHA256': hashlib.sha256(b''.join(cipher)).hexdigest(),
            'parts': [{'index': index, 'url': 'https://fictional-asset-' + str(index) + '.oaiusercontent.com/cipher?token=FICTIONAL_ONLY',
                'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()} for index, raw in enumerate(cipher, 1)]}}
    return value, data, binding_raw, cipher


class MockReceiveChecks(unittest.TestCase):
    def index(self, value, binding_raw, data, **changes):
        return M.checked_index(M.canonical(value).decode(), COMMIT,
            input_binding_sha256=changes.get('digest', hashlib.sha256(binding_raw).hexdigest()),
            additional_asset_bytes=changes.get('amount', sum(map(len, data.values()))))

    def test_portable_exact11_manifest_binding_and_lifetime_checked_before_download(self):
        value, data, raw, cipher = fixture()
        checked = self.index(value, raw, data)
        self.assertEqual(checked['binding_raw'], raw)
        self.assertEqual(len(checked['source_manifest']['files']), 11)
        self.assertEqual(checked['source_manifest']['exactCommit'], 'b' * 40)
        self.assertNotEqual(checked['source_manifest']['exactCommit'], COMMIT)
        self.assertEqual(checked['source_context']['inputManifestSHA'], hashlib.sha256(M.canonical(checked['source_manifest']['files'])).hexdigest())
        self.assertNotIn('files', value['assets'])
        self.assertEqual(hashlib.sha256(checked['source_manifest_raw']).hexdigest(), value['assets']['manifestSHA256'])
        for change in ('digest', 'bytes', 'missing-pin', 'source-scope', 'portable-sha', 'manifest-sha', 'part-order', 'host', 'expiry'):
            bad = copy.deepcopy(value); options = {}
            if change == 'digest': options['digest'] = 'f' * 64
            elif change == 'bytes': options['amount'] = sum(map(len, data.values())) + 1
            elif change == 'missing-pin':
                binding = M.P.decode(bad['inputBinding']); binding['assets'].pop('package')
                bad['inputBinding'] = M.canonical(binding).decode(); options['digest'] = hashlib.sha256(bad['inputBinding'].encode()).hexdigest()
            elif change == 'source-scope': bad['assets']['sourceContext']['scope'] = 'ISOLATED_GITHUB_END500_BACKUP_ONLY'
            elif change == 'portable-sha': bad['assets']['sourceContext']['inputManifestSHA'] = '0' * 64
            elif change == 'manifest-sha': bad['assets']['manifestSHA256'] = '0' * 64
            elif change == 'part-order': bad['assets']['parts'].reverse()
            elif change == 'host': bad['assets']['parts'][0]['url'] = 'https://invalid.example/PRIVATE'
            else: bad['expiresAtUTC'] = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
            with self.subTest(change=change), self.assertRaises(Exception): self.index(bad, raw, data, **options)

    def receive(self, root, *, close_failure=False, bad_declared_size=False):
        value, data, raw, cipher = fixture(); events = []
        context = {'schema': 'helmut-w15-mock500-controller-context/1', 'scope': 'ISOLATED_GITHUB_MOCK500_BINDING_ONLY',
            'exactCommit': COMMIT, 'runId': '123456789', 'runAttempt': 1, 'runnerTemp': str(root.parent)}
        private = {'cipherIndex': 'FICTIONAL_ARMORED_INDEX', 'keyB64': base64.b64encode(b'FICTIONAL_KEY').decode(),
            'passphrase': 'FICTIONAL_PASSPHRASE', 'eventInputs': {'w15_mode': M.MODE, 'expected_commit': COMMIT,
                'w15_request': 'FICTIONAL_PUBLIC_REQUEST', 'w15_cipher_index': 'FICTIONAL_ARMORED_INDEX'}}
        def crypto(*args, **kwargs):
            events.append(args[2])
            return ('sec:u::::::::\nfpr:::::::::' + M.V.FINGERPRINT + ':\n').encode()
        def originals(*args, **kwargs):
            events.append('originals-authenticated'); (root / 'received').mkdir(mode=0o700)
            self.assertEqual(kwargs['private_home'], str(root / 'gnupg'))
            self.assertEqual(kwargs['exact_commit'], M.E.SOURCE['exactCommit'])
            return {'sealedManifestSHA256': M.E.SEALED_SHA}
        relocated = {'verifiedFiles': 12, 'verifiedBytes': 242570240, 'checkoutCommit': COMMIT,
            'transferContext': M.E.SOURCE, 'originalPathFieldsModified': False}
        def assets(*args, **kwargs):
            events.append('assets-authenticated')
            self.assertEqual(kwargs['backup_scope'], M.SCOPE)
            self.assertEqual(kwargs['private_home'], str(root / 'gnupg'))
            self.assertEqual(kwargs['passphrase_file'], str(root / 'receiver-passphrase.PRIVATE'))
            self.assertEqual(kwargs['context']['exactCommit'], 'b' * 40)
            target = Path(kwargs['destination']); target.mkdir(mode=0o700); (target / 'assets').mkdir(mode=0o700)
            for key, body in data.items():
                path = target / 'assets' / (key + '.PRIVATE'); path.write_bytes(body); path.chmod(0o600)
            manifest_raw = M.canonical(kwargs['expected_manifest']) + b'\n'
            self.assertEqual(hashlib.sha256(manifest_raw).hexdigest(), kwargs['expected_manifest_sha256'])
            manifest_path = target / 'manifest.PRIVATE.json'; manifest_path.write_bytes(manifest_raw); manifest_path.chmod(0o600)
            return {'verifiedFiles': 11, 'verifiedBytes': sum(map(len, data.values())), 'localAuthenticatedReadbackObserved': True}
        def close(home):
            events.append('agent-close-confirmed' if not close_failure else 'agent-close-failed')
            if close_failure: raise RuntimeError('FICTIONAL_PASSPHRASE_NOT_FOR_OUTPUT')
        original_get, asset_get = Mock(return_value=root / 'source-cipher.PRIVATE.gpg'), Mock(return_value=root / 'assets-cipher.PRIVATE.gpg')
        with patch.object(M.E, 'source_binding', return_value={k: context[k] for k in ('exactCommit', 'runId', 'runAttempt')}), \
                patch.object(M.E, 'projection', return_value=[]), patch.object(M.V, 'private_root', return_value=root), \
                patch.object(M.N, 'check_event') as event, patch.object(M.A.resource, 'setrlimit'), \
                patch.object(M.A, '_run', side_effect=crypto), \
                patch.object(M.N, 'decrypt_index', return_value=M.canonical(value).decode()), \
                patch.object(M.E, 'download', original_get), patch.object(M.R, 'receive', side_effect=originals) as receive, \
                patch.object(M.IP, 'verify_received', return_value=SimpleNamespace(safe_summary=lambda: relocated)) as verify, \
                patch.object(M, 'download_assets', asset_get), patch.object(M.B, 'authenticated_readback', side_effect=assets) as decoder, \
                patch.object(M.N, '_close_agent', side_effect=close) as closed:
            try:
                result = M.prepare_inputs(context, private, input_binding_sha256=hashlib.sha256(raw).hexdigest(),
                    additional_asset_bytes=sum(map(len, data.values())) + int(bad_declared_size), guard=Mock())
            except M.MockReceiveError:
                closed.assert_called_once_with(root / 'gnupg')
                if bad_declared_size: original_get.assert_not_called(); asset_get.assert_not_called(); decoder.assert_not_called()
                raise
            event.assert_called_once_with(COMMIT, private['cipherIndex'], mode=M.MODE,
                extra_inputs={'w15_request': private['eventInputs']['w15_request']}, event_inputs=private['eventInputs'])
            receive.assert_called_once(); verify.assert_called_once(); decoder.assert_called_once()
            original_get.assert_called_once(); asset_get.assert_called_once(); closed.assert_called_once()
        return result, events

    def test_same_home_private_handoff_follows_both_verified_receives_and_agent_close(self):
        with tempfile.TemporaryDirectory(prefix='w15-fictional-mock-receive-') as tmp:
            root = Path(tmp); result, events = self.receive(root)
            self.assertEqual(events[-1], 'agent-close-confirmed')
            self.assertLess(events.index('originals-authenticated'), events.index('assets-authenticated'))
            self.assertEqual(result['received_root'], root / 'received')
            self.assertEqual(result['receiver_home'], root / 'gnupg')
            self.assertEqual(set(result['asset_paths']), M.ASSET_KEYS)
            self.assertEqual(result['safe_receipt']['verifiedFiles'], 12)
            self.assertEqual(result['safe_receipt']['additionalFiles'], 11)
            self.assertTrue(result['safe_receipt']['originalsUnchanged'])
            text = json.dumps(result['safe_receipt'])
            for private in (str(root), 'FICTIONAL_KEY', 'FICTIONAL_PASSPHRASE', '.oaiusercontent.com'): self.assertNotIn(private, text)
            self.assertEqual(result['passphrase_file'].stat().st_mode & 0o777, 0o600)

    def test_close_or_public_binding_failure_has_no_private_return_or_retry(self):
        for close_failure, bad_size in ((True, False), (False, True)):
            with self.subTest(close=close_failure, size=bad_size), tempfile.TemporaryDirectory(prefix='w15-fictional-mock-fail-') as tmp:
                with self.assertRaises(M.MockReceiveError) as failed:
                    self.receive(Path(tmp), close_failure=close_failure, bad_declared_size=bad_size)
                self.assertEqual(failed.exception.phase, 'agent-close' if close_failure else 'outer-index')
                self.assertEqual(str(failed.exception), 'MOCK500_RECEIVE_FAILED_OR_UNKNOWN')
                self.assertNotIn(tmp, str(failed.exception))

    def test_asset_stream_uses_existing_no_redirect_read1_and_stops_after_first_failure(self):
        bodies = [b'FICTIONAL-A', b'FICTIONAL-B']
        urls = ['https://fictional-' + str(i) + '.oaiusercontent.com/private?token=FICTIONAL' for i in (1, 2)]
        pins = [{'index': i, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()} for i, raw in enumerate(bodies, 1)]
        for bad in (False, True):
            calls = []
            def open_(request, timeout):
                index = len(calls); calls.append(request.full_url)
                self.assertEqual(request.get_method(), 'GET'); self.assertTrue(0 < timeout <= 60)
                return FIXTURES.Response(request.full_url, bodies[index], status=302 if bad else 200)
            opener = SimpleNamespace(open=open_)
            with tempfile.TemporaryDirectory(prefix='w15-fictional-asset-stream-') as tmp, \
                    patch.object(M.E.urllib.request, 'build_opener', return_value=opener) as build:
                def download(): return M.download_assets(Path(tmp), urls, datetime.now(timezone.utc) + timedelta(minutes=5), pins,
                    cipher_bytes=sum(map(len, bodies)), cipher_sha256=hashlib.sha256(b''.join(bodies)).hexdigest(), guard=Mock())
                if bad:
                    with self.assertRaises(M.MockReceiveError): download()
                    self.assertEqual(calls, urls[:1]); self.assertFalse((Path(tmp) / 'asset-part-02.PRIVATE.gpg').exists())
                else:
                    result = download(); self.assertEqual(result.read_bytes(), b''.join(bodies)); self.assertEqual(calls, urls)
                self.assertIsInstance(build.call_args.args[0], M.E.NoRedirect)
                self.assertEqual((Path(tmp) / 'asset-part-01.PRIVATE.gpg').stat().st_mode & 0o777, 0o600)


if __name__ == '__main__': unittest.main()
