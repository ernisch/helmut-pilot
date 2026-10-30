"""Focused fictional archive transport/admission/integration; no real inputs."""
import sys
sys.dont_write_bytecode = True
import copy
from datetime import datetime, timedelta, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

HERE = Path(__file__).absolute().parent


def load(name):
    spec = importlib.util.spec_from_file_location('w15_archive_test_' + name, HERE / (name + '.py'))
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


H, D, M, N = [load(n) for n in ('mock500_archive_receive', 'mock500_original_archive', 'mock500_receive', 'encrypted_index')]
FIX = load('test_mock500_receive')
COMMIT = 'a' * 40
NONCE = '26d5a413-5ca7-415c-a412-62fc45b561c8'


def descriptor():
    return {'format': H.FORMAT, 'driveId': H.DRIVE_ID, 'cipherBytes': D.CIPHER['bytes'],
        'cipherSHA256': D.CIPHER['sha256'], 'manifestSHA256': D.MANIFEST['sha256'],
        'url': 'https://fictional-archive.oaiusercontent.com/PRIVATE?token=FICTIONAL_ONLY'}


def approval(now):
    return {'schema': 'helmut-w15-mock-originals-receive-approval/1',
        'scope': 'ISOLATED_GITHUB_MOCK_ORIGINALS_RECEIVE_ONLY', 'authorized': True,
        'exactCommit': COMMIT, 'branch': H.V.BRANCH, 'nonce': NONCE, 'runAttempt': 1,
        'archiveSHA256': D.CIPHER['sha256'], 'maximumWallSeconds': H.WALL_SECONDS,
        'maxReceiveAttempts': 1, 'issuedAt': now.isoformat(), 'expiresAt': (now + timedelta(minutes=20)).isoformat()}


class ArchiveHandoffChecks(unittest.TestCase):
    def test_format_identity_freshness_nonce_and_legacy_part_bound(self):
        now = datetime.now(timezone.utc)
        value = {'schema': H.INDEX_SCHEMA, 'expectedCommit': COMMIT, 'nonce': NONCE,
            'createdAtUTC': now.isoformat(), 'expiresAtUTC': (now + timedelta(minutes=20)).isoformat(), 'archive': descriptor()}
        self.assertEqual(H.checked_index(json.dumps(value), COMMIT, NONCE)[0], descriptor())
        self.assertGreater(D.CIPHER['bytes'], 16777216)
        for change in ('schema', 'commit', 'nonce', 'expired', 'lifetime', 'format', 'driveId', 'cipherBytes', 'cipherSHA256', 'manifestSHA256', 'host', 'redirect', 'extra'):
            bad = copy.deepcopy(value)
            if change in ('schema', 'nonce'): bad[change] = 'invalid'
            elif change == 'commit': bad['expectedCommit'] = 'b' * 40
            elif change == 'expired': bad['expiresAtUTC'] = (now - timedelta(seconds=1)).isoformat()
            elif change == 'lifetime': bad['expiresAtUTC'] = (now + timedelta(hours=2)).isoformat()
            elif change == 'host': bad['archive']['url'] = 'https://drive.google.com/private'
            elif change == 'redirect': bad['archive']['url'] += '#fragment'
            elif change == 'extra': bad['archive']['secret'] = 'FICTIONAL_ONLY'
            else: bad['archive'][change] = 1 if change == 'cipherBytes' else 'invalid'
            with self.subTest(change=change), self.assertRaises(Exception): H.checked_index(json.dumps(bad), COMMIT, NONCE)

    def test_real_four_input_event_and_total_dispatch_size(self):
        armor = load('test_encrypted_index').armor()
        now = datetime.now(timezone.utc); request = approval(now)
        dispatch = N.dispatch_payload(COMMIT, armor, mode=H.MODE, extra_inputs={'w15_request': json.dumps(request)})
        inputs = json.loads(dispatch)['inputs']
        with tempfile.TemporaryDirectory(prefix='w15-fictional-event-') as tmp:
            path = Path(tmp) / 'event.json'; path.write_text(json.dumps({'inputs': inputs}))
            with patch.dict(os.environ, {'GITHUB_EVENT_NAME': 'workflow_dispatch', 'GITHUB_EVENT_PATH': str(path)}):
                self.assertEqual(H.validate_request(COMMIT, request, inputs), NONCE)
                bad = {**inputs, 'undocumented': 'FICTIONAL'}
                path.write_text(json.dumps({'inputs': bad}))
                with self.assertRaises(Exception): H.validate_request(COMMIT, request, bad)
        with self.assertRaises(Exception):
            N.dispatch_payload(COMMIT, armor, mode=H.MODE, extra_inputs={'w15_request': 'x' * 65535})
        self.assertLess(len(dispatch), 65535)

    def test_separate_receive_authority_rejects_expiry_retry_wrong_scope_commit_pin(self):
        now = datetime.now(timezone.utc); request = approval(now)
        for key, value in [('scope', 'ISOLATED_GITHUB_MOCK500_ONLY'), ('authorized', False), ('runAttempt', 2),
                ('maxReceiveAttempts', 2), ('exactCommit', 'b' * 40), ('branch', 'refs/heads/main'),
                ('archiveSHA256', '0' * 64), ('maximumWallSeconds', 12600), ('nonce', str(__import__('uuid').uuid1())),
                ('expiresAt', (now - timedelta(seconds=1)).isoformat())]:
            bad = {**request, key: value}
            inputs = {'w15_mode': H.MODE, 'expected_commit': COMMIT, 'w15_request': json.dumps(bad), 'w15_cipher_index': 'FICTIONAL'}
            with self.subTest(key=key), patch.object(H.N, 'check_event') as event, self.assertRaises(Exception):
                H.validate_request(COMMIT, bad, inputs)
            event.assert_not_called()

    def test_one_bounded_get_full_hash_readback_private_destination_and_fail_stop(self):
        body = b'FICTIONAL_CIPHER_ONLY'; base = descriptor()
        small = {**base, 'cipherBytes': len(body), 'cipherSHA256': hashlib.sha256(body).hexdigest()}
        for fault in ('none', 'redirect', 'size', 'hash', 'expiry', 'guard'):
            archive = dict(small); calls = []
            if fault == 'hash': archive['cipherSHA256'] = '0' * 64
            if fault == 'size': archive['cipherBytes'] += 1
            expires = datetime.now(timezone.utc) + timedelta(minutes=2 if fault != 'expiry' else -1)
            guard = Mock(side_effect=RuntimeError('FICTIONAL_SECRET') if fault == 'guard' else None)
            def open_(request, timeout):
                calls.append(request.full_url)
                self.assertEqual(request.get_method(), 'GET')
                return FIX.FIXTURES.Response(request.full_url, body, status=302 if fault == 'redirect' else 200)
            with tempfile.TemporaryDirectory(prefix='w15-fictional-one-get-') as tmp, \
                    patch.object(H, 'archive_description', side_effect=lambda value: value), \
                    patch.object(H.E.urllib.request, 'build_opener', return_value=SimpleNamespace(open=open_)):
                if fault == 'none':
                    result = H.download(Path(tmp), archive, expires, guard=guard)
                    self.assertEqual(result.read_bytes(), body); self.assertEqual(result.stat().st_mode & 0o777, 0o600)
                else:
                    with self.assertRaises(Exception): H.download(Path(tmp), archive, expires, guard=guard)
                self.assertLessEqual(len(calls), 1)

    def test_new_full_job_descriptor_binds_exact_old_original_pins_and_all11_assets(self):
        value, data, raw, cipher = FIX.fixture()
        binding = json.loads(raw)
        binding['assets'].update({key: {'bytes': row[1], 'sha256': row[2]} for key, row in D.FILES.items()})
        binding['sourceComparison']['qualificationSHA256'] = D.FILES['qualificationReport'][2]
        raw = M.canonical(binding); value['inputBinding'] = raw.decode(); value['assets'] = descriptor()
        checked = M.checked_index(M.canonical(value).decode(), COMMIT,
            input_binding_sha256=hashlib.sha256(raw).hexdigest(), additional_asset_bytes=D.TOTAL)
        self.assertEqual(checked['archive_format'], H.FORMAT)
        self.assertEqual(checked['binding_raw'], raw)
        self.assertEqual(len(checked['original_urls']), 15)
        # Fresh later-job URL is required; no path from an earlier runner exists.
        self.assertNotIn('received_root', checked)
        self.assertNotIn('source_context', checked)
        for key in D.FILES:
            bad = copy.deepcopy(value); b = json.loads(bad['inputBinding']); b['assets'][key]['sha256'] = '0' * 64
            bad['inputBinding'] = M.canonical(b).decode()
            with self.subTest(asset=key), self.assertRaises(Exception):
                M.checked_index(M.canonical(bad).decode(), COMMIT,
                    input_binding_sha256=hashlib.sha256(bad['inputBinding'].encode()).hexdigest(), additional_asset_bytes=D.TOTAL)
        # 17.8MB never becomes a newly allowed old-format 16MiB part.
        legacy, _, legacy_raw, _ = FIX.fixture()
        legacy['assets']['parts'][0]['bytes'] = D.CIPHER['bytes']
        with self.assertRaises(Exception): M.checked_index(M.canonical(legacy).decode(), COMMIT,
            input_binding_sha256=hashlib.sha256(legacy_raw).hexdigest(), additional_asset_bytes=sum(map(len, data.values())))

    def test_workflow_has_only_existing_secrets_no_plaintext_handoff_or_shell_input(self):
        raw = (HERE.parents[1] / '.github/workflows/ci.yml').read_text()
        job = raw.split('\n  mock500-receive-originals:\n', 1)[1]
        self.assertIn('environment: helmut-ci-originals', job)
        self.assertEqual(job.count('${{ secrets.'), 2)
        self.assertIn('persist-credentials: false', job)
        self.assertIn('inputs.w15_mode', job)
        run = job.split('        run: python3', 1)[1].split('\n', 1)[0]
        self.assertNotIn('${{', run)
        for bad in ('upload-artifact', 'download-artifact', 'actions/cache', 'gh secret', 'gpg --export-secret'):
            self.assertNotIn(bad, job)

    def test_inner_archive_phase_survives_real_runner_and_javascript_public_projection(self):
        workflow, runner = load('mock500_workflow'), load('mock500_runner')
        for inner in D.PHASES:
            phase = 'mock-receiver-archive-' + inner
            self.assertIn(phase, workflow.PHASES)
            failure = runner._failure({'ok': False, 'phase': 'worker', 'workerPhase': phase})
            self.assertEqual(failure.safe_failure['worker']['phase'], phase)
        # Execute the actual action in an isolated VM: only the child-process
        # boundary is fictional; no worker, database, HTTP or secrets exist.
        script = r'''
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(process.argv[1],'utf8');
for(const inner of ['arguments','cipher','recipient','destination','decrypt','gzip','archive','manifest','files','integrity','readback','cleanup']){
  const phase='mock-receiver-archive-'+inner, logs=[];
  const receipt={status:'FAIL_OR_BLOCKED_MOCK500_WORKFLOW',phase:'worker',worker:{phase},
    executionAuthority:false,retryAllowed:false,privateMessage:'FICTIONAL_MUST_BE_DROPPED'};
  const context={Buffer,Object,Number,JSON,Error,Set,
    process:{env:{W15_MODE:'mock500-full-gated',GITHUB_RUN_ATTEMPT:'1',GITHUB_EVENT_PATH:'/fictional/event'},exitCode:0},
    console:{log:line=>logs.push(line)},
    require:name=>name==='node:fs'?{readFileSync:()=>JSON.stringify({inputs:{w15_request:'{}'}})}:
      name==='node:child_process'?{spawnSync:()=>({status:1,stdout:JSON.stringify(receipt)})}:(()=>{throw Error('unexpected dependency')})()};
  vm.runInNewContext(source,context);
  assert.equal(logs.length,1);const actual=JSON.parse(logs[0]);
  assert.equal(actual.worker.phase,phase);assert.equal(context.process.exitCode,1);
  assert.ok(!logs[0].includes('FICTIONAL_MUST_BE_DROPPED'));
}
'''
        subprocess.run(['node', '-e', script, str(HERE.parents[1] / '.github/actions/w15-mock500/index.js')],
            stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            env={'PATH': os.environ['PATH']}, timeout=15, check=True)


if __name__ == '__main__': unittest.main()
