"""Prepare everything before requesting one fresh private Mock archive link.

Default --plan is inert. An explicitly approved execution binds a separately
reviewed launcher and the immutable receiver. After READY, the only network
operation this process permits is its single workflow dispatch. No cipher GET,
Drive API, original decryption, new secret, runner data upload or automatic retry.
"""
import sys
sys.dont_write_bytecode = True
from datetime import datetime, timedelta, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import select
import stat
import subprocess
import termios
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

HERE = Path(__file__).absolute().parent
REPO = HERE.parents[1]
SPEC = importlib.util.spec_from_file_location('w15_timed_receive_handoff', HERE / 'mock500_archive_receive.py')
H = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(H)
RECEIVER = '13b858b1a1e83a695e1fa64446573b5b550921ea'
RECEIVER_CI, RECEIVER_PR, WORKFLOW = 41025045991, 982, 313506164
BRANCH = 'codex/w15-github-end500-preparation-20261028'
ENVIRONMENT = 'helmut-ci-originals'
API_BASE = 'https://api.github.com/repos/ernisch/helmut-pilot'
CHECKS = {'Syntax + Offline-Suiten', 'Browser-/Mobile-Smoke (Chromium)'}
RECEIVER_REVIEW = 'helmut-w15-independent-mock-original-receive-review/1'
LAUNCHER_REVIEW = 'helmut-w15-independent-mock-receive-dispatch-review/1'
MIN_LINK_SECONDS = 90
PHASES = {'arguments', 'approval', 'launcher', 'receiver-review', 'launcher-review', 'receiver-ci',
          'launcher-ci', 'workflow', 'environment', 'branch', 'branch-update', 'branch-readback',
          'private-root', 'link', 'index', 'encryption', 'payload', 'final-expiry', 'attempt-marker', 'dispatch'}
HEX = re.compile(r'[a-f0-9]{40}\Z')
SHA = re.compile(r'[a-f0-9]{64}\Z')


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True, allow_nan=False).encode('ascii')


def decode(raw):
    def unique(items):
        result = {}
        for key, value in items:
            need(key not in result, 'arguments'); result[key] = value
        return result
    return json.loads(raw, object_pairs_hook=unique,
        parse_constant=lambda _: (_ for _ in ()).throw(DispatchRejected('arguments')))


class DispatchRejected(ValueError):
    def __init__(self, phase='arguments'):
        self.phase = phase if phase in PHASES else 'arguments'
        super().__init__('MOCK_ORIGINAL_RECEIVE_DISPATCH_REJECTED')


def need(value, phase):
    if not value: raise DispatchRejected(phase)


def utc(value, phase='approval'):
    need(type(value) is str and re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?Z', value), phase)
    return datetime.fromisoformat(value.replace('Z', '+00:00'))


def iso(value):
    return value.astimezone(timezone.utc).isoformat(timespec='microseconds').replace('+00:00', 'Z')


def validate_approval(value, launcher, now):
    keys = {'schema', 'scope', 'authorized', 'receiverCommit', 'launcherCommit', 'branch', 'environment',
        'workflowId', 'nonce', 'runAttempt', 'maxReceiveAttempts', 'receiverCI', 'launcherCI', 'launcherPR',
        'receiverReviewSHA256', 'launcherReviewSHA256', 'advanceAllowedBranch', 'stateDir', 'issuedAt', 'expiresAt'}
    need(type(value) is dict and set(value) == keys and type(launcher) is str and HEX.fullmatch(launcher)
         and value['schema'] == 'helmut-w15-mock-original-receive-dispatch-approval/1'
         and value['scope'] == 'ISOLATED_GITHUB_MOCK_ORIGINALS_RECEIVE_ONLY' and value['authorized'] is True
         and value['receiverCommit'] == RECEIVER and value['launcherCommit'] == launcher
         and value['branch'] == BRANCH and value['environment'] == ENVIRONMENT
         and type(value['workflowId']) is int and value['workflowId'] == WORKFLOW
         and type(value['receiverCI']) is int and value['receiverCI'] == RECEIVER_CI
         and value['advanceAllowedBranch'] is True and type(value['stateDir']) is str
         and value['stateDir'].startswith('/') and '..' not in Path(value['stateDir']).parts
         and type(value['runAttempt']) is int and value['runAttempt'] == 1
         and type(value['maxReceiveAttempts']) is int and value['maxReceiveAttempts'] == 1, 'approval')
    need(type(value['launcherCI']) is int and value['launcherCI'] > 0
         and type(value['launcherPR']) is int and value['launcherPR'] > 0
         and all(type(value[k]) is str and SHA.fullmatch(value[k]) for k in ('receiverReviewSHA256', 'launcherReviewSHA256')), 'approval')
    nonce = uuid.UUID(value['nonce'])
    need(str(nonce) == value['nonce'] and nonce.version == 4 and nonce.variant == uuid.RFC_4122, 'approval')
    issued, expires = utc(value['issuedAt']), utc(value['expiresAt'])
    need(issued <= now < expires and timedelta(0) < expires - issued <= timedelta(hours=2), 'approval')


def verify_review(pr, commit, schema, digest, phase):
    need(type(pr) is dict and pr.get('state') == 'open' and pr.get('merged') is False
         and type(pr.get('head')) is dict and pr['head'].get('sha') == commit, phase)
    body = pr.get('body'); need(type(body) is str and len(body) <= 65536, phase)
    found = []
    for raw in re.findall(r'```json\s*\n(.*?)\n```', body, re.DOTALL):
        try: record = decode(raw)
        except (ValueError, TypeError): continue
        if type(record) is dict and record.get('schema') == schema:
            found.append(record)
    need(len(found) == 1, phase)
    record = found[0]
    need(record.get('exactCommit') == commit
         and record.get('status') == 'PASS_INDEPENDENT_STATIC_CODE_REVIEW_ONLY'
         and record.get('independentOfImplementation') is True
         and type(record.get('remainingCriticalOrHighCodeFindings')) is int
         and record['remainingCriticalOrHighCodeFindings'] == 0
         and hashlib.sha256(canonical(record)).hexdigest() == digest, phase)


def remote(api, method, path, phase, body=None):
    try: return api(method, path, body) if body is not None else api(method, path)
    except BaseException: raise DispatchRejected(phase) from None


def verify_ci(api, run_id, commit, phase):
    run = remote(api, 'GET', '/actions/runs/' + str(run_id), phase)
    need(type(run) is dict and run.get('head_sha') == commit and run.get('status') == 'completed'
         and run.get('conclusion') == 'success' and run.get('workflow_id') == WORKFLOW, phase)
    jobs = remote(api, 'GET', '/actions/runs/' + str(run_id) + '/jobs?per_page=100', phase)
    need(type(jobs) is dict and type(jobs.get('jobs')) is list
         and type(jobs.get('total_count')) is int and jobs['total_count'] == len(jobs['jobs']) <= 100, phase)
    for name in CHECKS:
        selected = [job for job in jobs['jobs'] if job.get('name') == name]
        need(len(selected) == 1 and selected[0].get('status') == 'completed'
             and selected[0].get('conclusion') == 'success', phase)


def prepare(value, launcher, *, api, git, now, progress):
    """Every remote precondition and permitted branch update precedes READY."""
    validate_approval(value, launcher, now())
    git.check_launcher(launcher)
    verify_review(remote(api, 'GET', '/pulls/' + str(RECEIVER_PR), 'receiver-review'), RECEIVER,
        RECEIVER_REVIEW, value['receiverReviewSHA256'], 'receiver-review')
    verify_review(remote(api, 'GET', '/pulls/' + str(value['launcherPR']), 'launcher-review'), launcher,
        LAUNCHER_REVIEW, value['launcherReviewSHA256'], 'launcher-review')
    verify_ci(api, RECEIVER_CI, RECEIVER, 'receiver-ci')
    verify_ci(api, value['launcherCI'], launcher, 'launcher-ci')
    workflow = remote(api, 'GET', '/actions/workflows/' + str(WORKFLOW), 'workflow')
    need(type(workflow) is dict and workflow.get('id') == WORKFLOW and workflow.get('state') == 'active'
         and workflow.get('path') == '.github/workflows/ci.yml', 'workflow')
    env = remote(api, 'GET', '/environments/' + ENVIRONMENT, 'environment')
    need(type(env) is dict and env.get('name') == ENVIRONMENT
         and env.get('deployment_branch_policy') == {'protected_branches': False, 'custom_branch_policies': True}
         and type(env.get('protection_rules')) is list
         and [row.get('type') for row in env['protection_rules']] == ['branch_policy'], 'environment')
    policies = remote(api, 'GET', '/environments/' + ENVIRONMENT + '/deployment-branch-policies', 'environment')
    need(type(policies) is dict and policies.get('total_count') == 1
         and type(policies.get('branch_policies')) is list and len(policies['branch_policies']) == 1
         and policies['branch_policies'][0].get('name') == BRANCH
         and policies['branch_policies'][0].get('type') == 'branch', 'environment')
    path = '/git/ref/heads/' + BRANCH
    ref = remote(api, 'GET', path, 'branch')
    before = ref.get('object', {}).get('sha') if type(ref) is dict else None
    need(type(before) is str and HEX.fullmatch(before) and git.is_ancestor(before, RECEIVER), 'branch')
    progress['branchChanged'] = False
    if before != RECEIVER:
        progress.update({'branchUpdateAttempted': True, 'branchChanged': 'UNKNOWN'})
        reply = remote(api, 'PATCH', '/git/refs/heads/' + BRANCH, 'branch-update', {'sha': RECEIVER, 'force': False})
        need(type(reply) is dict and reply.get('object', {}).get('sha') == RECEIVER, 'branch-update')
        progress['branchChanged'] = True
    after = remote(api, 'GET', path, 'branch-readback')
    need(type(after) is dict and after.get('object', {}).get('sha') == RECEIVER, 'branch-readback')
    validate_approval(value, launcher, now())
    return before != RECEIVER


def private_directory(path):
    path = Path(path)
    need(path.is_absolute() and '..' not in path.parts and path != Path('/'), 'private-root')
    fd = os.open('/', os.O_RDONLY | os.O_DIRECTORY)
    try:
        for part in path.parts[1:]:
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd); fd = child
        info = os.fstat(fd)
        need(info.st_uid == os.getuid() and stat.S_IMODE(info.st_mode) == 0o700, 'private-root')
        return fd
    except BaseException:
        os.close(fd); raise


def write_public(fd, name, value):
    out = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=fd)
    with os.fdopen(out, 'wb') as stream:
        stream.write(canonical(value) + b'\n'); stream.flush(); os.fsync(stream.fileno())
    os.fsync(fd)


def signed_link(raw, now):
    """Validate the capability itself; do not extend its actual SAS expiry."""
    if type(raw) is bytes:
        need(0 < len(raw) <= 4096, 'link'); raw = raw.decode('ascii')
    need(type(raw) is str and 0 < len(raw) <= 4096 and all(33 <= ord(c) <= 126 for c in raw), 'link')
    parsed = urllib.parse.urlsplit(raw)
    need(parsed.scheme == 'https' and re.fullmatch(r'[a-z0-9-]+\.oaiusercontent\.com(?::443)?', parsed.netloc)
         and parsed.username is None and parsed.password is None and parsed.port in (None, 443) and not parsed.fragment, 'link')
    rows = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True, strict_parsing=True)
    query = dict(rows)
    need(len(query) == len(rows) and query.get('sp') == 'r' and query.get('sr') == 'b'
         and type(query.get('sig')) is str and bool(query['sig'])
         and 'sip' not in query and query.get('spr', 'https') == 'https', 'link')
    expires = utc(query.get('se'), 'link')
    if 'st' in query: need(utc(query['st'], 'link') <= now, 'link')
    need((expires - now).total_seconds() > MIN_LINK_SECONDS, 'link')
    return raw, expires


def execute(value, expected_launcher_commit, *, api, git, now, encrypt, link_provider, ready, state_dir, cleanup=None):
    """Injectable ordering boundary; one attempt, with truthful closed receipt."""
    phase, root_fd, attempted, accepted = 'approval', None, False, False
    progress = {'branchChanged': False, 'branchUpdateAttempted': False}
    first, secondary = None, []
    nonce = value.get('nonce') if type(value) is dict else None
    need(type(nonce) is str and re.fullmatch('[a-f0-9-]{36}', nonce), 'approval')
    result = {'schema': 'helmut-w15-mock-original-receive-dispatch-attempt/1',
        'receiverCommit': RECEIVER, 'launcherCommit': expected_launcher_commit,
        'nonce': nonce, 'branchChanged': False, 'dispatchAttempted': False, 'dispatchAccepted': False,
        'originalReceptionAccepted': False, 'retryAllowed': False, 'executionAuthority': False}
    try:
        phase = 'approval'; need(value.get('stateDir') == str(Path(state_dir)), 'approval')
        phase = 'private-root'; root_fd = private_directory(state_dir)
        # Consumes this approval before any branch mutation; never overwrites a
        # previous attempt, including an ambiguous POST outcome.
        write_public(root_fd, 'STARTED_' + nonce + '.SAFE.json', result)
        phase = 'approval'
        prepare(value, expected_launcher_commit, api=api, git=git, now=now, progress=progress)
        phase = 'link'; ready()
        raw, expires = signed_link(link_provider(), now())
        # No GitHub GET/PATCH or other network work may occur below this line.
        phase = 'index'; issued = now()
        index = {'schema': H.INDEX_SCHEMA, 'expectedCommit': RECEIVER, 'nonce': nonce,
            'createdAtUTC': iso(issued), 'expiresAtUTC': iso(min(expires, issued + timedelta(minutes=30))),
            'archive': {'format': H.FORMAT, 'driveId': H.DRIVE_ID, 'cipherBytes': 17780398,
                'cipherSHA256': 'f8447b6fdde4c2c4fa76a8322999bd844f0c4445ee6077b29e3d29f93359f414',
                'manifestSHA256': 'e07e4169abe3f41400900ff45e6f98d3dd18ee4ae5585f95e7fdcec98f960d7a', 'url': raw}}
        H.checked_index(canonical(index).decode('ascii'), RECEIVER, nonce, now=issued)
        phase = 'encryption'; armored = encrypt(canonical(index).decode('ascii'), RECEIVER, Path(state_dir))
        request = {'schema': 'helmut-w15-mock-originals-receive-approval/1',
            'scope': 'ISOLATED_GITHUB_MOCK_ORIGINALS_RECEIVE_ONLY', 'authorized': True,
            'exactCommit': RECEIVER, 'branch': 'refs/heads/' + BRANCH, 'nonce': nonce, 'runAttempt': 1,
            'archiveSHA256': index['archive']['cipherSHA256'], 'maximumWallSeconds': 600,
            'maxReceiveAttempts': 1, 'issuedAt': value['issuedAt'], 'expiresAt': value['expiresAt']}
        phase = 'payload'
        payload = H.N.dispatch_payload(RECEIVER, armored, mode=H.MODE, extra_inputs={'w15_request': canonical(request).decode('ascii')})
        need(type(payload) is bytes and len(payload) <= 65535, phase)
        phase = 'final-expiry'; validate_approval(value, expected_launcher_commit, now())
        need((expires - now()).total_seconds() > MIN_LINK_SECONDS, phase)
        phase = 'attempt-marker'
        write_public(root_fd, 'POST_ATTEMPT_' + nonce + '.SAFE.json', {**result, **progress, 'dispatchAttempted': True})
        # The last check is deliberately after fsync, directly before the POST.
        phase = 'final-expiry'; need((expires - now()).total_seconds() > MIN_LINK_SECONDS, phase)
        phase = 'dispatch'; attempted = True
        response = api('POST', '/actions/workflows/' + str(WORKFLOW) + '/dispatches', decode(payload))
        need(response is None, phase); accepted = True
    except BaseException as error:
        first = error.phase if type(error) is DispatchRejected else phase
    finally:
        result.update({**progress, 'dispatchAttempted': attempted, 'dispatchAccepted': accepted,
            'status': 'PASS_SINGLE_RECEIVE_DISPATCH_SUBMITTED_ACCEPTANCE_PENDING' if accepted else 'FAIL_OR_BLOCKED_DISPATCH',
            'phase': first or 'dispatch', 'firstFailedPhase': first, 'secondaryCleanupFailures': secondary})
        if cleanup is not None:
            try: cleanup()
            except BaseException: secondary.append('stdin-restore')
        if root_fd is not None:
            try: write_public(root_fd, 'RESULT_' + nonce + '.SAFE.json', result)
            except BaseException: secondary.append('result-write')
            try: os.close(root_fd)
            except BaseException: secondary.append('state-close')
    return result


class Git:
    def command(self, args, *, check=True):
        result = subprocess.run(['/usr/bin/git', '--no-optional-locks', '-c', 'core.hooksPath=/dev/null',
            '-c', 'core.fsmonitor=false', '-c', 'safe.directory=' + str(REPO), '-C', str(REPO)] + args,
            stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            env={'PATH': '/usr/bin:/bin', 'LANG': 'C', 'LC_ALL': 'C'}, timeout=30, close_fds=True)
        need(not check or result.returncode == 0, 'launcher')
        return result

    def check_launcher(self, commit):
        need(self.command(['rev-parse', 'HEAD']).stdout.strip().decode('ascii') == commit
             and self.command(['status', '--porcelain', '--untracked-files=all']).stdout == b''
             and self.is_ancestor(RECEIVER, commit), 'launcher')
        # The external launcher reuses the immutable receiver's crypto helpers.
        for name in ('mock500_archive_receive.py', 'encrypted_index.py', 'verify_receiver_key.py',
                     'verify_archive_key.py', 'prepare.py', 'seal.py'):
            relative = 'scripts/w15-github/' + name
            need(self.command(['rev-parse', RECEIVER + ':' + relative]).stdout ==
                 self.command(['rev-parse', commit + ':' + relative]).stdout, 'launcher')

    def is_ancestor(self, old, new):
        result = self.command(['merge-base', '--is-ancestor', old, new], check=False)
        need(result.returncode in (0, 1), 'branch')
        return result.returncode == 0


class GitHub:
    def __init__(self):
        self.token = os.environ.get('HELMUT_GITHUB_CI_ADMIN_TOKEN')
        need(type(self.token) is str and bool(self.token), 'arguments')

    def __call__(self, method, path, body=None):
        request = urllib.request.Request(API_BASE + path, method=method,
            data=None if body is None else canonical(body), headers={'Authorization': 'Bearer ' + self.token,
                'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28'})
        try:
            opener = urllib.request.build_opener(H.E.NoRedirect())
            with opener.open(request, timeout=20) as response:
                raw = response.read(2 * 1024 * 1024 + 1)
                need(len(raw) <= 2 * 1024 * 1024, 'arguments')
                if method == 'POST':
                    need(response.status == 204 and raw == b'', 'dispatch'); return None
                return decode(raw)
        except BaseException:
            # Neither urllib's URL nor remote response/credential content escapes.
            raise DispatchRejected('dispatch' if method == 'POST' else 'arguments') from None


class PrivateLinkInput:
    """Disable terminal echo before READY, bounded JSON read, restore afterwards."""
    def __init__(self):
        self.descriptor, self.previous = sys.stdin.fileno(), None

    def ready(self):
        if os.isatty(self.descriptor):
            self.previous = termios.tcgetattr(self.descriptor)
            hidden = list(self.previous); hidden[6] = list(self.previous[6])
            hidden[3] &= ~(termios.ECHO | termios.ICANON)
            hidden[6][termios.VMIN] = 0; hidden[6][termios.VTIME] = 0
            termios.tcsetattr(self.descriptor, termios.TCSANOW, hidden)
        print('READY_FOR_FRESH_PRIVATE_LINK', flush=True)

    def read(self):
        try:
            deadline, blocks, size = time.monotonic() + 120, [], 0
            while True:
                remaining = deadline - time.monotonic()
                need(remaining > 0 and size <= 8193, 'link')
                readable, _, _ = select.select([self.descriptor], [], [], remaining)
                need(readable == [self.descriptor], 'link')
                block = os.read(self.descriptor, min(4096, 8194 - size))
                need(bool(block), 'link'); size += len(block); blocks.append(block)
                if b'\n' in block: break
            raw = b''.join(blocks)
            need(raw.endswith(b'\n') and raw.count(b'\n') == 1 and len(raw) <= 8193, 'link')
            value = decode(raw)
            need(type(value) is dict and set(value) == {'url'} and type(value['url']) is str, 'link')
            return value['url']
        finally: self.close()

    def close(self):
        if self.previous is not None:
            termios.tcflush(self.descriptor, termios.TCIFLUSH)
            termios.tcsetattr(self.descriptor, termios.TCSANOW, self.previous)
            self.previous = None


def plan():
    return {'status': 'BLOCKED_EXACT_SEPARATE_GO_REVIEW_CI_AND_FRESH_LINK_REQUIRED',
        'receiverCommit': RECEIVER, 'receiverCI': RECEIVER_CI, 'workflowId': WORKFLOW,
        'branch': BRANCH, 'environment': ENVIRONMENT, 'minimumActualLinkSecondsExclusive': MIN_LINK_SECONDS,
        'allPreflightAndBranchWorkBeforeLink': True, 'maximumDispatchAttempts': 1,
        'originalReceptionAccepted': False, 'executionAuthority': False}


def main():
    import argparse
    parser = argparse.ArgumentParser(description='One approved receiver dispatch, fresh private link only after READY')
    parser.add_argument('--plan', action='store_true')
    parser.add_argument('--execute-after-go', action='store_true')
    parser.add_argument('--expected-launcher-commit')
    parser.add_argument('--approval-file')
    parser.add_argument('--state-dir')
    args = parser.parse_args()
    if not args.execute_after_go:
        print(json.dumps(plan(), sort_keys=True)); return 0
    try:
        need(not args.plan and args.expected_launcher_commit and args.approval_file and args.state_dir, 'arguments')
        approval_path = Path(args.approval_file)
        need(approval_path.is_absolute() and not approval_path.is_symlink(), 'approval')
        with approval_path.open('rb') as stream: raw = stream.read(65537)
        need(0 < len(raw) <= 65536, 'approval'); approval = decode(raw)
        def encrypt(value, commit, root):
            return H.N.encrypt_index(value, commit, root, index_schema=H.INDEX_SCHEMA)
        private_input = PrivateLinkInput()
        result = execute(approval, args.expected_launcher_commit, api=GitHub(), git=Git(),
            now=lambda: datetime.now(timezone.utc), encrypt=encrypt, link_provider=private_input.read,
            ready=private_input.ready, state_dir=args.state_dir, cleanup=private_input.close)
        print(json.dumps(result, sort_keys=True)); return 0 if result['dispatchAccepted'] else 1
    except BaseException as error:
        print(json.dumps({'status': 'FAIL_OR_BLOCKED_DISPATCH', 'phase':
            error.phase if type(error) is DispatchRejected else 'arguments', 'firstFailedPhase':
            error.phase if type(error) is DispatchRejected else 'arguments', 'dispatchAttempted': False,
            'originalReceptionAccepted': False, 'retryAllowed': False}, sort_keys=True)); return 1


if __name__ == '__main__': sys.exit(main())
