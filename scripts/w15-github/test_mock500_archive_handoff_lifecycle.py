"""Fictional lifecycle seams only: no network, GPG, original bytes or database."""
import sys
sys.dont_write_bytecode = True
import base64
from contextlib import ExitStack
from datetime import datetime, timedelta, timezone
import importlib.util
import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

HERE = Path(__file__).absolute().parent


def load(name):
    spec = importlib.util.spec_from_file_location('w15_lifecycle_' + name, HERE / (name + '.py'))
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


H, M, D = [load(n) for n in ('mock500_archive_receive', 'mock500_receive', 'mock500_original_archive')]
COMMIT, NONCE, RUN = 'a' * 40, '26d5a413-5ca7-415c-a412-62fc45b561c8', '123456789'
ARMORED = 'FICTIONAL_ENCRYPTED_INDEX_NOT_A_REAL_CIPHER'
PHRASE = 'FICTIONAL_PASSPHRASE_NOT_FOR_OUTPUT'


def fake_assets(destination):
    """Create only tiny fictional private files, using known public filenames."""
    destination = Path(destination); destination.mkdir(mode=0o700)
    paths = {}
    for key, row in D.FILES.items():
        path = destination / row[0]
        with path.open('xb') as stream:
            os.fchmod(stream.fileno(), 0o600); stream.write(('FICTIONAL-' + key).encode())
        paths[key] = path
    return {'asset_paths': paths, 'safe_receipt': {'verifiedFiles': 11, 'verifiedBytes': D.TOTAL,
        'gpgProcessStopped': 'PASS', 'executionAuthority': False, 'mock500Acceptance': False}}


class StandaloneLifecycleChecks(unittest.TestCase):
    def run_case(self, tmp, *, fault=None, close_failure=False):
        root = Path(tmp) / 'current-private-run'; root.mkdir(mode=0o700)
        event = Path(tmp) / 'event.json'
        inputs = {'w15_mode': H.MODE, 'expected_commit': COMMIT, 'w15_request': '{}', 'w15_cipher_index': ARMORED}
        event.write_text(json.dumps({'inputs': inputs}))
        observed = {'exactCommit': COMMIT, 'runId': RUN, 'runAttempt': 1}
        calls = []
        def download(where, archive, expires, *, guard):
            calls.append('download'); guard()
            if fault == 'download': raise RuntimeError(PHRASE)
            cipher = where / 'fictional.PRIVATE.gpg'; cipher.write_bytes(b'FICTIONAL'); cipher.chmod(0o600)
            return cipher
        def decode(cipher, **kwargs):
            calls.append('decode')
            self.assertEqual(Path(cipher).parent, root)
            self.assertEqual(kwargs['private_home'], str(root / 'gnupg'))
            self.assertEqual(kwargs['passphrase_file'], str(root / 'receiver-passphrase.PRIVATE'))
            self.assertEqual((root / 'gnupg').stat().st_mode & 0o777, 0o700)
            self.assertEqual((root / 'receiver-passphrase.PRIVATE').stat().st_mode & 0o777, 0o600)
            kwargs['guard']()
            if fault == 'decoder': raise D.ArchiveReceiveError('files', process_stopped='PASS')
            return fake_assets(kwargs['destination'])
        decoder = SimpleNamespace(CIPHER=D.CIPHER, TOTAL=D.TOTAL, receive=Mock(side_effect=decode))
        def close(home):
            calls.append('agent-close')
            self.assertEqual(home, root / 'gnupg')
            if close_failure: raise RuntimeError(PHRASE)
        with ExitStack() as stack:
            for target, name, kwargs in [
                (H, 'source_binding', {'return_value': observed}),
                (H, 'validate_request', {'return_value': NONCE}),
                (H.V, 'read_environment', {'return_value': (b'FICTIONAL_KEY', PHRASE.encode())}),
                (H.V, 'private_root', {'return_value': root}),
                (H.A.resource, 'setrlimit', {}), (H.A, '_run', {'return_value': b'FICTIONAL_KEY_LIST'}),
                (H.V, 'primary', {}), (H.N, 'decrypt_index', {'return_value': 'FICTIONAL_PRIVATE_INDEX'}),
                (H, 'checked_index', {'return_value': ({}, datetime.now(timezone.utc) + timedelta(minutes=5))}),
                (H, 'load', {'return_value': decoder}), (H, 'download', {'side_effect': download}),
                (H.N, '_close_agent', {'side_effect': close}),
                (H.os, 'statvfs', {'return_value': SimpleNamespace(f_bavail=10**10, f_frsize=1)}),
            ]:
                stack.enter_context(patch.object(target, name, **kwargs))
            stack.enter_context(patch.dict(os.environ, {'GITHUB_EVENT_PATH': str(event), H.N.ENV_NAME: ARMORED}))
            try:
                result = H.receive_only(COMMIT, tmp)
            except H.ArchiveHandoffError as error:
                self.assertEqual(calls[-1], 'agent-close')
                self.assertNotIn(PHRASE, str(error)); self.assertNotIn(tmp, str(error))
                self.assertEqual(calls.count('download'), 1)
                self.assertEqual(decoder.receive.call_count, 0 if fault == 'download' else 1)
                return None, error, calls
        self.assertEqual(calls, ['download', 'decode', 'agent-close'])
        return result, None, calls

    def test_success_returns_only_safe_receipt_after_actual_caller_agent_closure(self):
        with tempfile.TemporaryDirectory(prefix='w15-fictional-standalone-') as tmp:
            result, error, calls = self.run_case(tmp)
            self.assertIsNone(error)
            self.assertEqual(result['status'], 'PASS_MOCK_ORIGINALS_RECEIVED_ONLY_START_BLOCKED')
            self.assertEqual((result['verifiedFiles'], result['verifiedBytes']), (11, D.TOTAL))
            self.assertEqual(result['gpgAgentStopped'], 'PASS')
            self.assertFalse(result['persistentRunnerStorage'])
            self.assertTrue(result['laterMockMustReceiveInSameJob'])
            self.assertFalse(result['executionAuthority'] or result['end500Acceptance'] or result['mock500Acceptance'])
            text = json.dumps(result)
            for private in (tmp, PHRASE, 'FICTIONAL_KEY', 'FICTIONAL_PRIVATE_INDEX', 'asset_paths'):
                self.assertNotIn(private, text)

    def test_download_failure_stops_before_decoder_without_retry(self):
        with tempfile.TemporaryDirectory(prefix='w15-fictional-download-fail-') as tmp:
            result, error, calls = self.run_case(tmp, fault='download')
            self.assertIsNone(result); self.assertEqual(error.phase, 'asset-download')
            self.assertEqual(error.agent_stopped, 'PASS')
            self.assertEqual(error.process_stopped, 'UNKNOWN')
            self.assertEqual(calls, ['download', 'agent-close'])

    def test_decoder_failure_preserves_first_inner_phase_if_agent_cleanup_also_fails(self):
        for close_failure in (False, True):
            with self.subTest(close_failure=close_failure), tempfile.TemporaryDirectory(prefix='w15-fictional-decode-fail-') as tmp:
                result, error, calls = self.run_case(tmp, fault='decoder', close_failure=close_failure)
                self.assertIsNone(result); self.assertEqual(error.phase, 'asset-reception')
                self.assertEqual(error.archive_phase, 'files')
                self.assertEqual(error.process_stopped, 'PASS')
                self.assertEqual(error.agent_stopped, 'UNKNOWN' if close_failure else 'PASS')

    def test_agent_cleanup_failure_blocks_otherwise_successful_private_return(self):
        with tempfile.TemporaryDirectory(prefix='w15-fictional-close-fail-') as tmp:
            result, error, calls = self.run_case(tmp, close_failure=True)
            self.assertIsNone(result); self.assertEqual(error.phase, 'agent-close')
            self.assertEqual(error.process_stopped, 'PASS'); self.assertEqual(error.agent_stopped, 'UNKNOWN')


class FullJobLifecycleChecks(unittest.TestCase):
    def run_case(self, tmp, *, decoder_failure=False, close_failure=False):
        root = Path(tmp) / 'current-job-private'; root.mkdir(mode=0o700)
        context = {'schema': 'helmut-w15-mock500-controller-context/1', 'scope': 'ISOLATED_GITHUB_MOCK500_BINDING_ONLY',
            'exactCommit': COMMIT, 'runId': RUN, 'runAttempt': 1, 'runnerTemp': tmp}
        inputs = {'w15_mode': M.MODE, 'expected_commit': COMMIT, 'w15_request': 'FICTIONAL_REQUEST', 'w15_cipher_index': ARMORED}
        private = {'cipherIndex': ARMORED, 'keyB64': base64.b64encode(b'FICTIONAL_KEY').decode(),
            'passphrase': PHRASE, 'eventInputs': inputs}
        binding_raw = b'FICTIONAL_HASH_BOUND_INPUT_BINDING'
        checked = {'archive_format': H.FORMAT, 'original_urls': ['FICTIONAL_ORIGINAL_URL'],
            'original_expires': datetime.now(timezone.utc) + timedelta(minutes=5), 'archive': {},
            'asset_expires': datetime.now(timezone.utc) + timedelta(minutes=5), 'binding_raw': binding_raw}
        calls = []
        def originals(*args, **kwargs):
            calls.append('original-receive'); (root / 'received').mkdir(mode=0o700)
            self.assertEqual(kwargs['private_home'], str(root / 'gnupg'))
            return {'sealedManifestSHA256': M.E.SEALED_SHA}
        relocated = {'verifiedFiles': 12, 'verifiedBytes': 242570240, 'checkoutCommit': COMMIT,
            'transferContext': M.E.SOURCE, 'originalPathFieldsModified': False}
        guard = Mock()
        def download(where, archive, expires, *, guard):
            calls.append('archive-download'); self.assertEqual(where, root); guard()
            return root / 'fictional-archive.PRIVATE.gpg'
        def decode(cipher, **kwargs):
            calls.append('archive-decode')
            self.assertEqual(cipher, str(root / 'fictional-archive.PRIVATE.gpg'))
            self.assertEqual(kwargs['private_home'], str(root / 'gnupg'))
            self.assertEqual(kwargs['passphrase_file'], str(root / 'receiver-passphrase.PRIVATE'))
            self.assertIs(kwargs['guard'], guard)
            if decoder_failure: raise D.ArchiveReceiveError('integrity', process_stopped='PASS')
            return fake_assets(kwargs['destination'])
        archive_get, archive_decode = Mock(side_effect=download), Mock(side_effect=decode)
        def close(home):
            calls.append('agent-close')
            self.assertEqual(home, root / 'gnupg')
            if close_failure: raise RuntimeError(PHRASE)
        handoff, decoder = SimpleNamespace(download=archive_get), SimpleNamespace(receive=archive_decode)
        real_load = M._load
        def module(name):
            if name == 'mock500_archive_receive': return handoff
            if name == 'mock500_original_archive': return decoder
            return real_load(name)
        with ExitStack() as stack:
            for target, name, kwargs in [
                (M.E, 'source_binding', {'return_value': {k: context[k] for k in ('exactCommit', 'runId', 'runAttempt')}}),
                (M.E, 'projection', {'return_value': []}), (M.V, 'private_root', {'return_value': root}),
                (M.N, 'check_event', {}), (M.A.resource, 'setrlimit', {}),
                (M.A, '_run', {'return_value': ('sec:u::::::::\nfpr:::::::::' + M.V.FINGERPRINT + ':\n').encode()}),
                (M.N, 'decrypt_index', {'return_value': 'FICTIONAL_PRIVATE_INDEX'}),
                (M, 'checked_index', {'return_value': checked}),
                (M.E, 'download', {'return_value': root / 'fictional-originals.PRIVATE.gpg'}),
                (M.R, 'receive', {'side_effect': originals}),
                (M.IP, 'verify_received', {'return_value': SimpleNamespace(safe_summary=lambda: relocated)}),
                (M, '_load', {'side_effect': module}), (M.N, '_close_agent', {'side_effect': close}),
            ]:
                stack.enter_context(patch.object(target, name, **kwargs))
            legacy_get = stack.enter_context(patch.object(M, 'download_assets'))
            legacy_decode = stack.enter_context(patch.object(M.B, 'authenticated_readback'))
            try:
                result = M.prepare_inputs(context, private, input_binding_sha256='f' * 64,
                    additional_asset_bytes=D.TOTAL, guard=guard)
            except M.MockReceiveError as caught:
                self.assertNotIn(tmp, str(caught)); self.assertNotIn(PHRASE, str(caught))
                error = caught
                result = None
            else: error = None
            legacy_get.assert_not_called(); legacy_decode.assert_not_called()
            archive_get.assert_called_once(); archive_decode.assert_called_once()
        return result, error, calls, root, binding_raw

    def test_same_job_new_format_private_handoff_uses_current_agent_and_no_legacy_decoder(self):
        with tempfile.TemporaryDirectory(prefix='w15-fictional-full-handoff-') as tmp:
            result, error, calls, root, raw = self.run_case(tmp)
            self.assertIsNone(error)
            self.assertEqual(calls, ['original-receive', 'archive-download', 'archive-decode', 'agent-close'])
            self.assertEqual(result['received_root'], root / 'received')
            self.assertEqual(result['binding_raw'], raw)
            self.assertEqual(set(result['asset_paths']), M.ASSET_KEYS)
            self.assertTrue(all(p.parent == root / 'assets-received' for p in result['asset_paths'].values()))
            for path in result['asset_paths'].values(): self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            self.assertEqual(result['safe_receipt']['additionalFiles'], 11)
            self.assertEqual(result['safe_receipt']['additionalBytes'], D.TOTAL)
            self.assertNotIn(tmp, json.dumps(result['safe_receipt']))

    def test_new_decoder_failures_stop_without_fallback_and_preserve_inner_phase(self):
        for close_failure in (False, True):
            with self.subTest(close_failure=close_failure), tempfile.TemporaryDirectory(prefix='w15-fictional-full-fail-') as tmp:
                result, error, calls, root, raw = self.run_case(tmp, decoder_failure=True, close_failure=close_failure)
                self.assertIsNone(result)
                self.assertEqual(error.phase, 'archive-integrity')
                self.assertEqual(calls, ['original-receive', 'archive-download', 'archive-decode', 'agent-close'])


if __name__ == '__main__': unittest.main()
