"""Tiny capsule seams and one empty-agent lifecycle; no keys or original data.

The empty agent uses existing local GPG tools only; no SDK, DB or external network.
"""
import sys
sys.dont_write_bytecode = True

import copy
from datetime import datetime, timezone
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import select
import stat
import shutil
import subprocess
import tarfile
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

SPEC = importlib.util.spec_from_file_location('capsule_reader_tested',
    Path(__file__).with_name('mock500_materials_capsule_readback.py'))
M = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(M)
NOW = datetime(2026, 11, 2, 12, tzinfo=timezone.utc)
PRIVATE = 'FICTIONAL_PRIVATE_CANARY_MUST_NEVER_BE_PUBLIC'


def category():
    return {'schema': 'helmut-w15-materials-first-failure/1',
        'category': 'MATERIALS_MAIN_CHECK_047', 'kind': 'assertion', 'stage': 'builder'}


def archive(*, input_sha=None, truncated=False, extra=False, node_category=None,
            failure_category=None, node_reason=PRIVATE, node_stack=PRIVATE):
    first = category() if failure_category is None else failure_category
    outcome = {'materialsCompleted': True, 'firstFailure': first,
        'cleanup': {'confirmedZero': True, 'profileFieldsUnchanged': True,
            'profiles': 500, 'activeProfiles': 0, 'nativeZeroState': 'BOUND_PREPARED_ZERO'}}
    node = M.canonical({'safe': first if node_category is None else node_category,
                        'reason': node_reason, 'stack': node_stack})
    controller = M.canonical({'phase': 'mock500-controller-materials', 'type': 'PermissionError',
        'message': PRIVATE, 'traceback': 'Traceback (most recent call last):\n'
        '  File "/private/' + PRIVATE + '/scripts/synthetik-500-w15-full500-controller.py", line 817, in run_bound\n'
        '    private_call()\nPermissionError: ' + PRIVATE})
    payloads = {M.SOURCES[0]: node, M.SOURCES[1]: controller, M.SOURCES[2]: b''}
    metadata = []
    if truncated:
        payloads[M.SOURCES[0]] = b'NOT_COMPLETE_JSON' + b'x' * (M.MAX_FILE - 17)
        payloads[M.SOURCES[1]] = b''
        outcome['cleanup'] = {'confirmedZero': True, 'after': {'active': 0}}
    for name, data in payloads.items():
        cut = truncated and name == M.SOURCES[0]
        metadata.append({'path': name, 'present': True, 'originalBytes': len(data) + (1 if cut else 0),
            'retainedBytes': len(data), 'truncated': cut,
            'strategy': 'FIRST_AND_LAST_32768_BYTES_NOT_COMPLETE' if cut else 'COMPLETE'})
    payloads[M.OUTCOME] = M.canonical(outcome)
    payloads[M.COLLECTION] = M.canonical({'scope': 'ISOLATED_GITHUB_MOCK500_MATERIALS_DIAGNOSTIC_ONLY',
        'privateSelectionOnly': True, 'completeBackup': False, 'sources': metadata})
    manifest = {'version': 1, 'exactCommit': M.SOURCE_COMMIT, 'runId': str(M.SOURCE_RUN),
        'runAttempt': 1, 'inputManifestSHA': M.SOURCE_INPUT_SHA if input_sha is None else input_sha,
        'recipientFingerprint': M.V.FINGERPRINT,
        'files': [{'path': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
                  for name, data in sorted(payloads.items())]}
    buffer = io.BytesIO()
    if not extra:
        # Use the source582 producer, including PAX_FORMAT. Its short ASCII
        # members have ordinary USTAR headers and need no extended records.
        with tempfile.TemporaryDirectory(prefix='w15ct-') as tmp:
            root = Path(tmp)
            for name, data in payloads.items():
                path = root / name; path.write_bytes(data); path.chmod(0o600)
            fd = M.S._directory(str(root), private=True)
            try:
                snapshots = [M.S._verify_file(fd, row) for row in manifest['files']]
                M.S._write_archive(buffer, fd, M.canonical(manifest), manifest['files'], snapshots)
            finally: os.close(fd)
        return buffer.getvalue()
    with tarfile.open(fileobj=buffer, mode='w', format=tarfile.USTAR_FORMAT) as tar:
        rows = [('W15_MANIFEST.PRIVATE.json', M.canonical(manifest))]
        rows += [('files/' + name, data) for name, data in sorted(payloads.items())]
        if extra: rows.append(('files/' + M.SOURCES[0], node))
        for name, data in rows:
            info = tarfile.TarInfo(name); info.size = len(data); info.mode = 0o600
            tar.addfile(info, io.BytesIO(data))
    return buffer.getvalue()


class CapsuleReadbackChecks(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix='w15c-'); self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.cipher = b'FICTIONAL_CIPHER_NO_CRYPTO_OR_REAL_DATA'
        pin = {'bytes': len(self.cipher), 'sha256': hashlib.sha256(self.cipher).hexdigest()}
        self.request = {'schema': 'helmut-w15-materials-capsule-readback-request/1', 'scope': M.SCOPE,
            'authorized': True, 'exactCommit': 'e' * 40, 'nonce': '11111111-2222-4333-8444-555555555555',
            'sourceRun': M.SOURCE_RUN, 'sourceCommit': M.SOURCE_COMMIT, 'sourceArtifact': M.SOURCE_ARTIFACT,
            'cipherPin': pin, 'issuedAt': '2026-11-02T11:59:00Z', 'expiresAt': '2026-11-02T12:10:00Z'}
        self.secret = Mock(return_value=(b'FICTIONAL_KEY', b'FICTIONAL_PASSPHRASE'))
        self.decrypt = Mock(return_value=archive()); self.stop = Mock()
        def private_root(_):
            root = self.root / 'g'; root.mkdir(mode=0o700); return root
        for target, name, value in ((M, 'CIPHER', pin),
            (M, 'bind_runtime', Mock(return_value={'exactCommit': 'e' * 40, 'runId': '987654321', 'runAttempt': 1})),
            (M.V, 'read_environment', self.secret), (M.V, 'private_root', private_root),
            (M, 'decrypt', self.decrypt), (M, 'stop_agent', self.stop)):
            task = patch.object(target, name, value); task.start(); self.addCleanup(task.stop)

    def admit(self):
        return M.admit(self.request, 'e' * 40, str(self.root), now=NOW)

    def download(self, data=None):
        path = self.root / M.ROOT_NAME / 'cipher' / M.CIPHER_NAME
        path.write_bytes(self.cipher if data is None else data); path.chmod(0o644)
        return path

    def read(self):
        return M.read_existing(self.request, 'e' * 40, str(self.root), now=NOW)

    def test_closed_read_reports_source_fields_without_raw_canary_or_false_full_pass(self):
        self.admit(); self.secret.assert_not_called(); cipher = self.download()
        result = self.read()
        self.assertEqual(result['status'], 'PASS_EXISTING_CAPSULE_READ_ONLY')
        self.assertIs(result['materialsCompleted'], True)  # A later cleanup failure may coexist.
        self.assertEqual(result['firstFailure'], category()); self.assertEqual(result['nodeFirstFailure'], category())
        self.assertEqual(result['providerCheck'], 'UNKNOWN')
        self.assertEqual(result['controllerFailure'], {'phase': 'mock500-controller-materials',
            'kind': 'filesystem', 'location': 'CONTROLLER_PUBLIC_LINE_817'})
        self.assertEqual(result['sourceReportedActiveProfiles'], 0)
        self.assertEqual(cipher.stat().st_mode & 0o777, 0o600)
        self.assertFalse(result['independentManifestPinAvailable'] or result['completeBackupAccepted']
                         or result['mock500Acceptance'] or result['executionAuthority'])
        self.assertNotIn(PRIVATE, json.dumps(result)); self.assertNotIn('/private/', json.dumps(result))
        self.secret.assert_called_once(); self.decrypt.assert_called_once(); self.stop.assert_called_once()
        with self.assertRaises(M.CapsuleError): self.read()
        self.secret.assert_called_once(); self.decrypt.assert_called_once()

    def test_wrong_request_or_cipher_pin_stops_before_secret_access_and_has_no_retry(self):
        for change in ({'sourceArtifact': M.SOURCE_ARTIFACT + 1}, {'scope': 'ISOLATED_GITHUB_MOCK500_ONLY'},
                       {'expiresAt': '2026-11-02T12:00:00Z'}, {'authorized': False}):
            with self.subTest(change=change), self.assertRaises(M.CapsuleError):
                M.validate_request({**self.request, **change}, 'e' * 40, now=NOW)
        self.admit(); self.download(b'WRONG_CIPHER')
        with self.assertRaises(M.CapsuleError): self.read()
        self.secret.assert_not_called(); self.decrypt.assert_not_called(); self.stop.assert_not_called()
        with self.assertRaises(M.CapsuleError): self.read()

    def test_exact_source_input_pin_and_no_duplicate_or_partial_json_reinterpretation(self):
        bad = archive(input_sha='84b730490014c5d17f81ac350677275ce33f368731c8f4a979a4d1b2c9165bf5')
        for raw in (bad, archive(extra=True)):
            with self.assertRaises(M.CapsuleError): M.parse_capsule(raw, self.root)
        good = archive(truncated=True)
        result = M.parse_capsule(good, self.root)
        self.assertTrue(result['collectionTruncated']); self.assertIsNone(result['nodeFirstFailure'])
        self.assertIsNone(result['controllerFailure']); self.assertEqual(result['firstFailure'], category())
        self.assertEqual(result['sourceReportedActiveProfiles'], 'UNKNOWN')
        self.assertNotIn(PRIVATE, json.dumps(result))

    def test_agent_stop_unknown_prevents_pass_and_keeps_only_closed_projection(self):
        self.admit(); self.download(); self.stop.side_effect = RuntimeError(PRIVATE)
        with self.assertRaises(M.CapsuleError) as failed: self.read()
        self.assertEqual(failed.exception.phase, 'agent-close')
        self.assertEqual(failed.exception.projection['firstFailure'], category())
        self.assertNotIn(PRIVATE, json.dumps(failed.exception.projection))
        self.assertEqual(str(failed.exception), 'EXISTING_MATERIALS_CAPSULE_REJECTED')
        self.stop.assert_called_once()

    def test_duplicate_or_nonfinite_manifest_keeps_actual_archive_phase(self):
        for raw in (b'{"version":1,"version":1}', b'{"version":NaN}'):
            buffer = io.BytesIO()
            with tarfile.open(fileobj=buffer, mode='w', format=tarfile.USTAR_FORMAT) as archive:
                member = tarfile.TarInfo('W15_MANIFEST.PRIVATE.json')
                member.size = len(raw)
                archive.addfile(member, io.BytesIO(raw))
            with self.subTest(raw=raw), self.assertRaises(M.CapsuleError) as failed:
                M.parse_capsule(buffer.getvalue(), self.root)
            self.assertEqual(failed.exception.phase, 'archive')

    def test_conflicting_first_failure_witnesses_never_create_authoritative_cause(self):
        conflicting = dict(category(), category='MATERIALS_MAIN_CHECK_048')
        with self.assertRaises(M.CapsuleError) as failed:
            M.parse_capsule(archive(node_category=conflicting), self.root)
        self.assertEqual(failed.exception.phase, 'outcome')


class ProviderProjectionChecks(unittest.TestCase):
    def first(self):
        return {'schema': 'helmut-w15-materials-first-failure/1',
                'category': 'MATERIALS_BINDING_CHECK_132', 'kind': 'assertion', 'stage': 'calendar'}

    def node(self, line=29, column=10, *, filename='w15-unit0-provider.js', reason=PRIVATE):
        function = 'validIndex' if filename == 'w15-full500-provider.js' else 'Object.prepare'
        return {'safe': self.first(), 'reason': reason, 'stack': 'AssertionError [ERR_ASSERTION]: '
            + reason + '\n    at ' + function + ' (/private/' + PRIVATE + '/scripts/fixtures/'
            + filename + ':' + str(line) + ':' + str(column) + ')\n'
            + '    at Object.calendarFixture (/private/' + PRIVATE + '/scripts/w15-github/mock500_bindings.js:132:16)'}

    def test_actual_existing_provider_separates_index_model_and_endpoint_without_network(self):
        repo = Path(__file__).resolve().parents[2]
        script = """
const P=require('./scripts/fixtures/w15-full500-provider');
const E=require('./lib/helmut/synthetik-500-eu-service-contract');
Object.assign(process.env,{AZURE_OPENAI_ENDPOINT:new URL(E.CONTRACT.responseURL).origin,
 AZURE_OPENAI_KEY:'LOCAL_MOCK_NOT_A_VALID_PROVIDER_KEY',AZURE_OPENAI_DEPLOYMENT:E.CONTRACT.model});
const result=[];
for(const [index,model,responsesURL]of [[-1,E.CONTRACT.model,E.CONTRACT.responseURL],
 [0,'FICTIONAL_WRONG_MODEL',E.CONTRACT.responseURL],[0,E.CONTRACT.model,'https://example.invalid/FICTIONAL']]){
 try{P.prepare({index,row:{},model,responsesURL});throw Error('SYNTHETIC_REJECTION_MISSING');}
 catch(error){if(error.code!=='ERR_ASSERTION')throw error;result.push({reason:error.message,stack:error.stack});}
}
console.log(JSON.stringify(result));
"""
        child = subprocess.run(['node', '-e', script], cwd=repo, capture_output=True, text=True, check=True)
        rows = json.loads(child.stdout)
        self.assertEqual(len(rows), 3)
        for node, expected in zip(rows, ('PROVIDER_INDEX_REJECTED', 'PROVIDER_MODEL_REJECTED', 'PROVIDER_ENDPOINT_REJECTED')):
            node['safe'] = self.first()
            self.assertEqual(M.provider_projection(node, self.first()), expected)

    def test_private_archive_projects_only_closed_source_check_and_never_private_message(self):
        cases = ((15, 'w15-full500-provider.js', 'PROVIDER_INDEX_REJECTED'),
                 (19, 'w15-unit0-provider.js', 'PROVIDER_CONTEXT_REJECTED'),
                 (24, 'w15-unit0-provider.js', 'PROVIDER_CURRENT_CONTEXT_EMPTY'),
                 (26, 'w15-unit0-provider.js', 'PROVIDER_REVIEW_HASH_REJECTED'),
                 (29, 'w15-unit0-provider.js', 'PROVIDER_REVIEW_CONTEXT_REJECTED'),
                 (41, 'w15-unit0-provider.js', 'PROVIDER_INPUT_USAGE_REJECTED'),
                 (42, 'w15-unit0-provider.js', 'PROVIDER_OUTPUT_USAGE_REJECTED'))
        with tempfile.TemporaryDirectory(prefix='provider-projection-fictional-') as tmp:
            for index, (line, filename, expected) in enumerate(cases):
                root = Path(tmp) / str(index); root.mkdir(mode=0o700)
                node = self.node(line, filename=filename)
                value = M.parse_capsule(archive(failure_category=self.first(), node_stack=node['stack']), root)
                self.assertEqual(value['firstFailure'], self.first())
                self.assertEqual(value['providerCheck'], expected)
                self.assertNotIn(PRIVATE, json.dumps(value)); self.assertNotIn('/private/', json.dumps(value))

    def test_forged_message_frames_unrelated_origins_and_incomplete_evidence_stay_unknown(self):
        fake = 'Injected value\n    at Object.prepare (/private/scripts/fixtures/w15-unit0-provider.js:29:10)'
        forged = self.node(reason=fake)
        forged['stack'] = 'AssertionError [ERR_ASSERTION]: ' + fake + '\n    at actualUnknownOrigin (unknown.js:1:1)'
        unknown = [forged, self.node(999), self.node(20, 999), self.node(filename='w15-unit0-provider.js.evil'),
                   {**self.node(), 'reason': PRIVATE + 'MISMATCH'},
                   {**self.node(), 'reason': 'X' * 2048}, {**self.node(), 'stack': 'X' * 4097},
                   {**self.node(), 'safe': category()}]
        capped = self.node(); capped['stack'] += 'X' * (4096 - len(capped['stack'])); unknown.append(capped)
        fake_index = self.node(15, filename='w15-full500-provider.js')
        fake_index['stack'] = fake_index['stack'].replace('at validIndex (', 'at Object.prepare (')
        unknown.append(fake_index)
        for node in unknown:
            self.assertEqual(M.provider_projection(node, self.first()), 'UNKNOWN')
        self.assertEqual(M.provider_projection(self.node(), category()), 'UNKNOWN')


class AgentCloseChecks(unittest.TestCase):
    def fixture(self, response=b'D 4321\nOK\n', events=None):
        close = Mock(); poll = Mock()
        poll.poll.return_value = [(55, select.POLLIN)] if events is None else events
        tasks = [patch.object(M.os, 'pidfd_open', return_value=55), patch.object(M.os, 'close'),
            patch.object(M.os, 'stat', return_value=SimpleNamespace(st_mode=stat.S_IFDIR,
                st_uid=os.getuid())), patch.object(M.select, 'poll', return_value=poll),
            patch.object(M.subprocess, 'run', return_value=SimpleNamespace(returncode=0, stdout=response)),
            patch.object(M, 'load', return_value=SimpleNamespace(_close_agent=close))]
        for task in tasks: task.start(); self.addCleanup(task.stop)
        return close, poll

    def test_official_client_pid_is_bound_without_autostart_before_scoped_stop(self):
        close, poll = self.fixture()
        home = Path('/FICTIONAL_PRIVATE_AGENT_HOME')
        def stop(_):
            M.os.pidfd_open.assert_called_once_with(4321)
            M.os.stat.assert_called_once_with('/proc/4321', follow_symlinks=False)
        close.side_effect = stop
        M.stop_agent(home)
        self.assertEqual(M.subprocess.run.call_args.args[0], ['/usr/bin/gpg-connect-agent',
            '--homedir', str(home), '--no-autostart', 'GETINFO pid', '/bye'])
        self.assertEqual(M.subprocess.run.call_args.kwargs['timeout'], 5)
        close.assert_called_once_with(home)
        poll.register.assert_called_once_with(55, select.POLLIN)
        M.os.close.assert_called_once_with(55)

    def test_unowned_pid_is_closed_but_never_accepted(self):
        close, poll = self.fixture()
        M.os.stat.return_value.st_uid = os.getuid() + 1
        home = Path('/FICTIONAL_PRIVATE_AGENT_HOME')
        with self.assertRaises(M.CapsuleError): M.stop_agent(home)
        close.assert_called_once_with(home)
        poll.register.assert_not_called(); M.os.close.assert_called_once_with(55)

    def test_bad_protocol_or_missing_exit_proof_never_claims_agent_stop(self):
        close, poll = self.fixture(response=b'D private-invalid-pid\nOK\n')
        home = Path('/FICTIONAL_PRIVATE_AGENT_HOME')
        with self.assertRaises(M.CapsuleError): M.stop_agent(home)
        close.assert_called_once_with(home); M.os.pidfd_open.assert_not_called()
        M.subprocess.run.return_value.stdout = b'D 4321\nOK\n'
        close.reset_mock(); poll.poll.return_value = [(55, select.POLLNVAL)]
        with self.assertRaises(M.CapsuleError): M.stop_agent(home)
        close.assert_called_once_with(home); M.os.close.assert_called_once_with(55)

    @unittest.skipUnless(hasattr(os, 'pidfd_open') and shutil.which('gpgconf')
                         and shutil.which('gpg-connect-agent'), 'Linux pidfd and existing GPG tools required')
    def test_actual_empty_daemon_exits_without_keys_secrets_or_cipher(self):
        with tempfile.TemporaryDirectory(prefix='w15ga-') as tmp:
            home = Path(tmp); home.chmod(0o700)
            observed_fd, stopped = None, False
            try:
                launched = subprocess.run(['/usr/bin/gpgconf', '--homedir', str(home), '--launch', 'gpg-agent'],
                    stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                    env=M.V.ENV, timeout=15)
                self.assertEqual(launched.returncode, 0)
                actual = subprocess.run(['/usr/bin/gpg-connect-agent', '--homedir', str(home),
                    '--no-autostart', 'GETINFO pid', '/bye'], stdin=subprocess.DEVNULL,
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=M.V.ENV, timeout=15)
                self.assertEqual(actual.returncode, 0)
                found = re.findall(rb'^D ([1-9][0-9]+)$', actual.stdout, re.MULTILINE)
                self.assertEqual(len(found), 1)
                observed_fd = os.pidfd_open(int(found[0]))
                M.stop_agent(home); stopped = True
                poll = select.poll(); poll.register(observed_fd, select.POLLIN)
                self.assertTrue(any(events & select.POLLIN for _, events in poll.poll(5000)))
                self.assertEqual(list(home.glob('private-keys-v1.d/*.key')), [])
            finally:
                if not stopped:
                    subprocess.run(['/usr/bin/gpgconf', '--homedir', str(home), '--kill', 'gpg-agent'],
                        stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                        env=M.V.ENV, timeout=15)
                if observed_fd is not None: os.close(observed_fd)


if __name__ == '__main__': unittest.main()
