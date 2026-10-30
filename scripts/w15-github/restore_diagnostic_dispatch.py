"""One reviewed restore/export diagnostic dispatch; fresh links only after READY.

Default plan is inert. Reuses the existing receiver's GitHub/GPG/private-file
helpers. No Drive or cipher GET, secret copy, restore, paid API or retry here.
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
import subprocess
import termios
import time
import uuid

HERE = Path(__file__).absolute().parent
REPO = HERE.parents[1]


def component(name):
    spec = importlib.util.spec_from_file_location('w15_diagnostic_sender_' + name, HERE / (name + '.py'))
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


M, W = component('mock500_receive_dispatch'), component('restore_workflow')
N, canonical, decode = M.H.N, M.canonical, M.decode
MODE, SCOPE = W.DIAGNOSTIC, W.SCOPES[W.DIAGNOSTIC]
BRANCH, ENVIRONMENT, WORKFLOW = M.BRANCH, M.ENVIRONMENT, M.WORKFLOW
REVIEW_SCHEMA = 'helmut-w15-independent-restore-diagnostic-code-review/1'
SOURCE_FILE = HERE / 'restore-diagnostic-source-parts.SAFE.json'
MAX_FRAME = 70000
READY = 'READY_FOR_FRESH_PRIVATE_DIAGNOSTIC_LINKS'
PHASES = {'arguments', 'approval', 'qualification', 'launcher', 'review', 'ci', 'workflow', 'environment',
    'branch', 'branch-update', 'branch-readback', 'private-root', 'link', 'index', 'encryption', 'payload',
    'final-expiry', 'attempt-marker', 'dispatch', 'cleanup'}


class DispatchRejected(ValueError):
    def __init__(self, phase='arguments'):
        self.phase = phase if phase in PHASES else 'arguments'
        super().__init__('RESTORE_DIAGNOSTIC_DISPATCH_REJECTED')


def need(value, phase):
    if not value: raise DispatchRejected(phase)


def source_parts():
    value = decode(SOURCE_FILE.read_bytes())
    projection = decode((REPO / M.H.E.PROJECTION).read_bytes())
    rows = value.get('parts')
    need(value.get('schema') == 'helmut-w15-existing-end500-source-parts/1'
         and value.get('sourceReceipt') == projection['sourceReceipt']
         and value.get('cipher') == {key: projection['cipher'][key] for key in ('bytes', 'sha256')}
         and value.get('recipientFingerprint') == M.H.V.FINGERPRINT
         and value.get('originals') == {'files': 12, 'bytes': 242570240}
         and type(rows) is list and len(rows) == 15, 'qualification')
    for index, (row, pin) in enumerate(zip(rows, projection['cipher']['parts'], strict=True), 1):
        need(type(row) is dict and set(row) == {'index', 'name', 'bytes', 'sha256', 'driveFileId'}
             and {key: row[key] for key in pin} == pin
             and row['name'] == 'end500.gpg.part-' + str(index).zfill(3)
             and type(row['driveFileId']) is str and re.fullmatch('[A-Za-z0-9_-]{20,100}', row['driveFileId']), 'qualification')
    need(len({row['driveFileId'] for row in rows}) == 15, 'qualification')
    return rows


def validate_approval(value, target, launcher, request, now):
    keys = {'schema', 'scope', 'authorized', 'targetCommit', 'launcherCommit', 'branch', 'environment',
        'workflowId', 'nonce', 'runAttempt', 'maxReceiveAttempts', 'targetCI', 'targetPR', 'reviewSHA256',
        'requestSHA256', 'advanceAllowedBranch', 'stateDir', 'issuedAt', 'expiresAt'}
    need(type(value) is dict and set(value) == keys and type(target) is str and M.HEX.fullmatch(target)
         and target == launcher and value['schema'] == 'helmut-w15-restore-diagnostic-dispatch-approval/1'
         and value['scope'] == SCOPE and value['authorized'] is True
         and value['targetCommit'] == target and value['launcherCommit'] == launcher
         and value['branch'] == BRANCH and value['environment'] == ENVIRONMENT
         and type(value['workflowId']) is int and value['workflowId'] == WORKFLOW
         and type(value['targetCI']) is int and value['targetCI'] > 0
         and type(value['targetPR']) is int and value['targetPR'] > 0
         and value['advanceAllowedBranch'] is True and type(value['stateDir']) is str
         and Path(value['stateDir']).is_absolute() and '..' not in Path(value['stateDir']).parts
         and type(value['runAttempt']) is int and value['runAttempt'] == 1
         and type(value['maxReceiveAttempts']) is int and value['maxReceiveAttempts'] == 1
         and all(type(value[k]) is str and M.SHA.fullmatch(value[k]) for k in ('reviewSHA256', 'requestSHA256')), 'approval')
    nonce = uuid.UUID(value['nonce'])
    need(str(nonce) == value['nonce'] and nonce.version == 4 and nonce.variant == uuid.RFC_4122, 'approval')
    need(type(request) is dict and set(request) == W.DECLARATION_KEYS
         and hashlib.sha256(canonical(request)).hexdigest() == value['requestSHA256']
         and request['nonce'] == value['nonce'] and request['limits'] == W.LIMITS
         and all(type(x) is int for x in request['limits'].values())
         and type(request['maximumWallSeconds']) is int and request['maximumWallSeconds'] == 1800, 'approval')
    approval = request['approval']
    expected = {'schema': 'helmut-w15-workflow-start-approval/1', 'scope': SCOPE, 'authorized': True,
        'exactCommit': target, 'branch': 'refs/heads/' + BRANCH, 'runAttempt': 1, 'nonce': value['nonce'],
        'mode': MODE, 'limits': W.LIMITS, 'maximumWallSeconds': 1800,
        'sourceQualificationSHA256': request['sourceQualification']['sha256'], 'maxReceiveAttempts': 1,
        'issuedAt': value['issuedAt'], 'expiresAt': value['expiresAt'], 'maxStorageUSD': '0', 'maxProviderCalls': 0}
    need(type(approval) is dict and approval == expected
         and all(type(approval[k]) is int for k in ('runAttempt', 'maximumWallSeconds', 'maxReceiveAttempts', 'maxProviderCalls'))
         and all(type(x) is int for x in approval['limits'].values())
         and approval['authorized'] is True, 'approval')
    issued, expires = W._utc(value['issuedAt']), W._utc(value['expiresAt'])
    need(issued <= now < expires and timedelta(0) < expires - issued <= timedelta(hours=2), 'approval')


class Git(M.Git):
    def check_launcher(self, commit):
        need(self.command(['rev-parse', 'HEAD']).stdout.strip().decode('ascii') == commit
             and self.command(['status', '--porcelain', '--untracked-files=all']).stdout == b'', 'launcher')

    def qualify(self, commit, qualification):
        component('runtime_inputs')._validate_qualification({'exactCommit': commit}, qualification, REPO)
        source_parts()


def prepare(value, target, launcher, request, *, api, git, now, progress):
    validate_approval(value, target, launcher, request, now())
    git.check_launcher(launcher)
    raw, digest, qualification = W.decode_qualification(request['sourceQualification'])
    need(qualification['exactCommit'] == target and digest == request['approval']['sourceQualificationSHA256'], 'qualification')
    try: git.qualify(target, qualification)
    except BaseException: raise DispatchRejected('qualification') from None
    pr = M.remote(api, 'GET', '/pulls/' + str(value['targetPR']), 'launcher-review')
    M.verify_review(pr, target, REVIEW_SCHEMA, value['reviewSHA256'], 'launcher-review')
    records = [decode(block) for block in re.findall(r'```json\s*\n(.*?)\n```', pr['body'], re.DOTALL)]
    reviews = [row for row in records if type(row) is dict and row.get('schema') == REVIEW_SCHEMA]
    need(len(reviews) == 1 and reviews[0].get('scope') == SCOPE
         and reviews[0].get('executionAuthority') is False, 'review')
    M.verify_ci(api, value['targetCI'], target, 'launcher-ci')
    workflow = M.remote(api, 'GET', '/actions/workflows/' + str(WORKFLOW), 'workflow')
    need(type(workflow) is dict and workflow.get('id') == WORKFLOW and workflow.get('state') == 'active'
         and workflow.get('path') == '.github/workflows/ci.yml', 'workflow')
    env = M.remote(api, 'GET', '/environments/' + ENVIRONMENT, 'environment')
    need(type(env) is dict and env.get('name') == ENVIRONMENT
         and env.get('deployment_branch_policy') == {'protected_branches': False, 'custom_branch_policies': True}
         and type(env.get('protection_rules')) is list
         and [row.get('type') for row in env['protection_rules']] == ['branch_policy'], 'environment')
    policy = M.remote(api, 'GET', '/environments/' + ENVIRONMENT + '/deployment-branch-policies', 'environment')
    need(type(policy) is dict and policy.get('total_count') == 1 and type(policy.get('branch_policies')) is list
         and len(policy['branch_policies']) == 1 and policy['branch_policies'][0].get('name') == BRANCH
         and policy['branch_policies'][0].get('type') == 'branch', 'environment')
    path = '/git/ref/heads/' + BRANCH
    ref = M.remote(api, 'GET', path, 'branch')
    before = ref.get('object', {}).get('sha') if type(ref) is dict else None
    need(type(before) is str and M.HEX.fullmatch(before) and git.is_ancestor(before, target), 'branch')
    if before != target:
        progress.update(branchUpdateAttempted=True, branchChanged='UNKNOWN')
        reply = M.remote(api, 'PATCH', '/git/refs/heads/' + BRANCH, 'branch-update', {'sha': target, 'force': False})
        need(type(reply) is dict and reply.get('object', {}).get('sha') == target, 'branch-update')
        progress['branchChanged'] = True
    after = M.remote(api, 'GET', path, 'branch-readback')
    need(type(after) is dict and after.get('object', {}).get('sha') == target, 'branch-readback')
    validate_approval(value, target, launcher, request, now())


def execute(value, target, launcher, request, *, api, git, now, encrypt, link_provider, ready, state_dir, cleanup=None):
    phase, fd, attempted, accepted = 'approval', None, False, False
    progress = {'branchChanged': False, 'branchUpdateAttempted': False}
    first, secondary = None, []
    result = {'schema': 'helmut-w15-restore-diagnostic-dispatch-attempt/1', 'targetCommit': target,
        'launcherCommit': launcher, 'mode': MODE, 'dispatchAttempted': False, 'dispatchAccepted': False,
        'restoreAccepted': False, 'retryAllowed': False, 'executionAuthority': False}
    try:
        validate_approval(value, target, launcher, request, now())
        need(value['stateDir'] == str(Path(state_dir)), 'approval')
        nonce = value['nonce']; result['nonce'] = nonce
        phase = 'private-root'; fd = M.private_directory(state_dir)
        M.write_public(fd, 'STARTED_' + nonce + '.SAFE.json', result)
        phase = 'launcher'; prepare(value, target, launcher, request, api=api, git=git, now=now, progress=progress)
        phase = 'link'; ready(); links = link_provider()
        need(type(links) is list and len(links) == 15, phase)
        checked = [M.signed_link(link, now()) for link in links]
        need(len({row[0] for row in checked}) == 15, phase)
        # Below READY the sender performs no GET/PATCH/network preparation.
        phase = 'index'; issued = now(); expiry = min(row[1] for row in checked)
        index = {'schema': 'helmut-w15-private-cipher-url-index/1', 'expectedCommit': target,
            'createdAtUTC': M.iso(issued), 'expiresAtUTC': M.iso(min(expiry, issued + timedelta(minutes=30))),
            'parts': [{'index': i, 'url': row[0]} for i, row in enumerate(checked, 1)]}
        M.H.E.url_index(canonical(index).decode('ascii'), target, now=issued)
        phase = 'encryption'; armored = encrypt(canonical(index).decode('ascii'), target, Path(state_dir))
        phase = 'payload'
        payload = N.dispatch_payload(target, armored, mode=MODE, extra_inputs={'w15_request': canonical(request).decode('ascii')})
        need(type(payload) is bytes and len(payload) <= 65535, phase)
        phase = 'final-expiry'; validate_approval(value, target, launcher, request, now())
        need((expiry - now()).total_seconds() > M.MIN_LINK_SECONDS, phase)
        phase = 'attempt-marker'
        M.write_public(fd, 'POST_ATTEMPT_' + nonce + '.SAFE.json', {**result, **progress, 'dispatchAttempted': True})
        phase = 'final-expiry'; validate_approval(value, target, launcher, request, now())
        need((expiry - now()).total_seconds() > M.MIN_LINK_SECONDS, phase)
        phase = 'dispatch'; attempted = True
        response = api('POST', '/actions/workflows/' + str(WORKFLOW) + '/dispatches', decode(payload))
        need(response is None, phase); accepted = True
    except BaseException as error:
        selected = getattr(error, 'phase', None)
        aliases = {'launcher-review': 'review', 'launcher-ci': 'ci'}
        selected = aliases.get(selected, selected) if type(selected) is str else None
        first = selected if selected in PHASES else phase
    finally:
        if cleanup is not None:
            try: cleanup()
            except BaseException: secondary.append('stdin-restore')
        result.update(**progress, dispatchAttempted=attempted, dispatchAccepted=accepted,
            status=('PASS_SINGLE_DIAGNOSTIC_DISPATCH_SUBMITTED_ACCEPTANCE_PENDING' if accepted else
                    'UNKNOWN_DIAGNOSTIC_DISPATCH_OUTCOME' if attempted else 'BLOCKED_DIAGNOSTIC_DISPATCH'),
            firstFailedPhase=first, phase=first or 'dispatch', secondaryCleanupFailures=secondary)
        if secondary:
            result.update(status='FAIL_DIAGNOSTIC_DISPATCH_CLEANUP_UNCONFIRMED', firstFailedPhase=first or 'cleanup', phase=first or 'cleanup')
        if fd is not None:
            try: M.write_public(fd, 'RESULT_' + value['nonce'] + '.SAFE.json', result)
            except BaseException: secondary.append('result-write')
            try: os.close(fd)
            except BaseException: secondary.append('state-close')
        if secondary:
            result.update(status='FAIL_DIAGNOSTIC_DISPATCH_CLEANUP_UNCONFIRMED', firstFailedPhase=first or 'cleanup', phase=first or 'cleanup')
    return result


class PrivateLinksInput(M.PrivateLinkInput):
    def ready(self):
        if os.isatty(self.descriptor):
            self.previous = termios.tcgetattr(self.descriptor)
            hidden = list(self.previous); hidden[6] = list(self.previous[6])
            hidden[3] &= ~(termios.ECHO | termios.ICANON)
            hidden[6][termios.VMIN] = hidden[6][termios.VTIME] = 0
            termios.tcsetattr(self.descriptor, termios.TCSANOW, hidden)
        print(READY, flush=True)

    def read(self):
        try:
            deadline, blocks, size = time.monotonic() + 120, [], 0
            while True:
                remaining = deadline - time.monotonic()
                need(remaining > 0 and size < MAX_FRAME, 'link')
                readable, _, _ = select.select([self.descriptor], [], [], remaining)
                need(readable == [self.descriptor], 'link')
                block = os.read(self.descriptor, min(4096, MAX_FRAME - size))
                need(bool(block), 'link'); size += len(block); blocks.append(block)
                if b'\n' in block: break
            raw = b''.join(blocks)
            need(raw.endswith(b'\n') and raw.count(b'\n') == 1 and len(raw) <= MAX_FRAME, 'link')
            value = decode(raw)
            need(type(value) is dict and set(value) == {'urls'} and type(value['urls']) is list
                 and len(value['urls']) == 15 and all(type(url) is str for url in value['urls']), 'link')
            return value['urls']
        finally: self.close()


def public_file(path):
    path = Path(path); fd = M.private_directory(path.parent)
    child = None
    try:
        child, snap = N.S._file(fd, path.name)
        need(0 < snap[2] <= 65535, 'approval')
        raw = os.read(child, 65536)
        need(len(raw) == snap[2] and N.S._snapshot(os.fstat(child)) == snap, 'approval')
        return decode(raw)
    finally:
        if child is not None: os.close(child)
        os.close(fd)


def main():
    import argparse
    parser = argparse.ArgumentParser(description='One separately approved restore/export diagnostic dispatch')
    parser.add_argument('--plan', action='store_true')
    parser.add_argument('--execute-after-go', action='store_true')
    parser.add_argument('--expected-commit')
    parser.add_argument('--approval-file')
    parser.add_argument('--request-file')
    parser.add_argument('--state-dir')
    args = parser.parse_args()
    if not args.execute_after_go:
        print(json.dumps({'status': 'BLOCKED_SEPARATE_DIAGNOSTIC_GO_REQUIRED', 'mode': MODE,
            'maximumDispatchAttempts': 1, 'sourceParts': 15, 'minimumActualLinkSecondsExclusive': 90,
            'executionAuthority': False}, sort_keys=True)); return 0
    try:
        need(not args.plan and all((args.expected_commit, args.approval_file, args.request_file, args.state_dir)), 'arguments')
        value, request = public_file(args.approval_file), public_file(args.request_file)
        private_input = PrivateLinksInput()
        result = execute(value, args.expected_commit, args.expected_commit, request, api=M.GitHub(), git=Git(),
            now=lambda: datetime.now(timezone.utc), encrypt=N.encrypt_index, link_provider=private_input.read,
            ready=private_input.ready, state_dir=args.state_dir, cleanup=private_input.close)
        print(json.dumps(result, sort_keys=True)); return 0 if result['dispatchAccepted'] and not result['secondaryCleanupFailures'] else 1
    except BaseException as error:
        print(json.dumps({'status': 'BLOCKED_DIAGNOSTIC_DISPATCH', 'phase':
            error.phase if type(error) is DispatchRejected else 'arguments', 'dispatchAttempted': False,
            'restoreAccepted': False, 'retryAllowed': False}, sort_keys=True)); return 1


if __name__ == '__main__': sys.exit(main())
