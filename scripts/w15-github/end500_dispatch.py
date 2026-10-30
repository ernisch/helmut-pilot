"""One reviewed complete isolated End500 dispatch; fresh links only after READY.

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
    spec = importlib.util.spec_from_file_location('w15_end500_sender_' + name, HERE / (name + '.py'))
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


F = component('full_restore_dispatch')
M, W, N, canonical, decode = F.M, F.W, F.N, F.canonical, F.decode
MODE = 'end500-full-gated'
PC = component('phase_contract')
FUNCTION = component('restore_function_acceptance')

def mode_scope(value):
    return (PC.END_MODE, PC.SCOPES[PC.END_MODE]) if type(value) is dict and value.get('scope') == PC.SCOPES[PC.END_MODE] else (MODE, SCOPE)

ACCEPTANCE_SCHEMA = 'helmut-w15-independent-limited-restore-acceptance/1'
SCOPE = W.SCOPES[MODE]
LAUNCHER_REVIEW_SCHEMA = 'helmut-w15-independent-end500-launcher-review/1'
BRANCH, ENVIRONMENT, WORKFLOW = M.BRANCH, M.ENVIRONMENT, M.WORKFLOW
REVIEW_SCHEMA = 'helmut-w15-independent-end500-receiver-review/1'
SOURCE_FILE = HERE / 'restore-diagnostic-source-parts.SAFE.json'
MAX_FRAME = 70000
READY = 'READY_FOR_FRESH_PRIVATE_END500_LINKS'
PHASES = {'arguments', 'approval', 'qualification', 'launcher', 'review', 'ci', 'workflow', 'environment',
    'restore-acceptance', 'restore-run', 'branch', 'branch-readback', 'receiver-review', 'launcher-review', 'receiver-ci', 'launcher-ci', 'private-root', 'link', 'index', 'encryption', 'payload',
    'final-expiry', 'attempt-marker', 'dispatch', 'cleanup'}


class DispatchRejected(ValueError):
    def __init__(self, phase='arguments'):
        self.phase = phase if phase in PHASES else 'arguments'
        super().__init__('END500_DISPATCH_REJECTED')


def need(value, phase):
    if not value: raise DispatchRejected(phase)


source_parts = F.source_parts
Git = F.Git
public_file = F.public_file

def validate_approval(value, target, launcher, request, now):
    selected_mode, selected_scope = mode_scope(value)
    keys = {'schema', 'scope', 'authorized', 'targetCommit', 'launcherCommit', 'branch', 'environment',
        'workflowId', 'nonce', 'runAttempt', 'maxReceiveAttempts', 'targetCI', 'targetPR', 'reviewSHA256', 'launcherCI', 'launcherPR', 'launcherReviewSHA256', 'sourceQualificationSHA256',
        'restoreAcceptanceReviewSHA256', 'requestSHA256', 'advanceAllowedBranch', 'stateDir', 'issuedAt', 'expiresAt'}
    need(type(value) is dict and set(value) == keys and type(target) is str and M.HEX.fullmatch(target)
         and type(launcher) is str and M.HEX.fullmatch(launcher) and value['schema'] == 'helmut-w15-end500-dispatch-approval/1'
         and value['scope'] == selected_scope and value['authorized'] is True
         and value['targetCommit'] == target and value['launcherCommit'] == launcher
         and value['branch'] == BRANCH and value['environment'] == ENVIRONMENT
         and type(value['workflowId']) is int and value['workflowId'] == WORKFLOW
         and type(value['targetCI']) is int and value['targetCI'] > 0
         and type(value['targetPR']) is int and value['targetPR'] > 0
         and type(value['launcherCI']) is int and value['launcherCI'] > 0
         and type(value['launcherPR']) is int and value['launcherPR'] > 0
         and value['advanceAllowedBranch'] is False and type(value['stateDir']) is str
         and Path(value['stateDir']).is_absolute() and '..' not in Path(value['stateDir']).parts
         and type(value['runAttempt']) is int and value['runAttempt'] == 1
         and type(value['maxReceiveAttempts']) is int and value['maxReceiveAttempts'] == 1
         and all(type(value[k]) is str and M.SHA.fullmatch(value[k]) for k in ('reviewSHA256', 'requestSHA256', 'launcherReviewSHA256', 'sourceQualificationSHA256', 'restoreAcceptanceReviewSHA256')), 'approval')
    nonce = uuid.UUID(value['nonce'])
    need(str(nonce) == value['nonce'] and nonce.version == 4 and nonce.variant == uuid.RFC_4122, 'approval')
    need(type(request) is dict and set(request) == W.DECLARATION_KEYS
         and hashlib.sha256(canonical(request)).hexdigest() == value['requestSHA256']
         and request['nonce'] == value['nonce'] and request['limits'] == W.LIMITS
         and all(type(x) is int for x in request['limits'].values())
         and type(request['maximumWallSeconds']) is int and request['maximumWallSeconds'] == 3600, 'approval')
    approval = request['approval']
    expected = {'schema': 'helmut-w15-workflow-start-approval/1', 'scope': selected_scope, 'authorized': True,
        'exactCommit': target, 'branch': 'refs/heads/' + BRANCH, 'runAttempt': 1, 'nonce': value['nonce'],
        'mode': selected_mode, 'limits': W.LIMITS, 'maximumWallSeconds': 3600,
        'sourceQualificationSHA256': request['sourceQualification']['sha256'], 'maxReceiveAttempts': 1,
        **({'restoreFunctionAcceptance': approval.get('restoreFunctionAcceptance'), 'resourceContract': PC.END_PROFILE}
           if selected_mode == PC.END_MODE else {'restoreAcceptance': approval.get('restoreAcceptance')}), 'issuedAt': value['issuedAt'], 'expiresAt': value['expiresAt'], 'maxStorageUSD': '0.05', 'maxProviderCalls': 0}
    need(type(approval) is dict and approval == expected
         and all(type(approval[k]) is int for k in ('runAttempt', 'maximumWallSeconds', 'maxReceiveAttempts', 'maxProviderCalls'))
         and all(type(x) is int for x in approval['limits'].values())
         and approval['authorized'] is True, 'approval')
    if selected_mode == PC.END_MODE:
        FUNCTION.reference(approval['restoreFunctionAcceptance'], target)
        issued, expires = W._utc(value['issuedAt']), W._utc(value['expiresAt'])
        need(issued <= now < expires and timedelta(0) < expires - issued <= timedelta(hours=2), 'approval')
        return
    previous = approval['restoreAcceptance']
    need(type(previous) is dict and set(previous) == {'runId', 'exactCommit', 'receiptSHA256', 'status'}
         and previous['status'] == 'PASS_INDEPENDENT_LIMITED_RESTORE_ACCEPTANCE'
         and previous['exactCommit'] == target and type(previous['runId']) is str
         and re.fullmatch('[1-9][0-9]{4,19}', previous['runId'])
         and type(previous['receiptSHA256']) is str and M.SHA.fullmatch(previous['receiptSHA256']), 'approval')
    issued, expires = W._utc(value['issuedAt']), W._utc(value['expiresAt'])
    need(issued <= now < expires and timedelta(0) < expires - issued <= timedelta(hours=2), 'approval')


def verify_restore_acceptance(pr, target, approval, previous, *, api):
    """Require independently accepted FULL restore evidence, never diagnostic PASS."""
    phase = 'restore-acceptance'
    need(type(pr) is dict and pr.get('state') == 'open' and pr.get('merged') is False
         and pr.get('head', {}).get('sha') == target and type(pr.get('body')) is str
         and len(pr['body']) <= 65536, phase)
    try:
        records = [decode(block) for block in re.findall(r'```json\s*\n(.*?)\n```', pr['body'], re.DOTALL)]
    except BaseException: raise DispatchRejected(phase) from None
    records = [row for row in records if type(row) is dict and row.get('schema') == ACCEPTANCE_SCHEMA]
    need(len(records) == 1, phase)
    record = records[0]
    need(hashlib.sha256(canonical(record)).hexdigest() == approval['restoreAcceptanceReviewSHA256'], phase)
    need(record.get('status') == previous['status'] and record.get('exactCommit') == target
         and record.get('runId') == previous['runId'] and record.get('receiptSHA256') == previous['receiptSHA256']
         and record.get('scope') == W.SCOPES['end500-restore-gated']
         and record.get('independentOfImplementation') is True and record.get('executionAuthority') is False
         and type(record.get('runAttempt')) is int and record['runAttempt'] == 1
         and type(record.get('verifiedFiles')) is int and record['verifiedFiles'] == 12
         and type(record.get('verifiedBytes')) is int and record['verifiedBytes'] == 242570240
         and type(record.get('profiles')) is int and record['profiles'] == 500
         and type(record.get('activeProfiles')) is int and record['activeProfiles'] == 0
         and all(record.get(key) is True for key in ('fullRestoreAccepted', 'backupRoundtripVerified',
             'remoteReadbackObserved', 'databaseRestoreObserved', 'resourcesAccepted', 'cleanupVerified')), phase)
    try: run = api('GET', '/actions/runs/' + previous['runId'])
    except BaseException: raise DispatchRejected('restore-run') from None
    need(type(run) is dict and type(run.get('id')) is int and str(run['id']) == previous['runId']
         and run.get('head_sha') == target and run.get('head_branch') == BRANCH
         and run.get('event') == 'workflow_dispatch' and run.get('status') == 'completed'
         and run.get('conclusion') == 'success' and type(run.get('run_attempt')) is int and run['run_attempt'] == 1
         and run.get('workflow_id') == WORKFLOW, 'restore-run')
    # The new dispatch run ID does not exist yet. The unchanged receiver checks
    # previous.runId != its actual GITHUB_RUN_ID in W.validate_admission.


def prepare(value, target, launcher, request, *, api, git, now, progress, restore_function_evidence=None):
    selected_mode, selected_scope = mode_scope(value)
    validate_approval(value, target, launcher, request, now())
    git.check_launcher(launcher)
    raw, digest, qualification = W.decode_qualification(request['sourceQualification'])
    need(qualification['exactCommit'] == target and digest == request['approval']['sourceQualificationSHA256'] == value['sourceQualificationSHA256'], 'qualification')
    try: git.qualify(target, qualification)
    except BaseException: raise DispatchRejected('qualification') from None
    digest_qualification = digest
    receiver_pr = None
    for commit, pr_id, schema, digest, phase in (
        (target, value['targetPR'], REVIEW_SCHEMA, value['reviewSHA256'], 'receiver-review'),
        (launcher, value['launcherPR'], LAUNCHER_REVIEW_SCHEMA, value['launcherReviewSHA256'], 'launcher-review')):
        pr = M.remote(api, 'GET', '/pulls/' + str(pr_id), phase)
        M.verify_review(pr, commit, schema, digest, phase)
        records = [decode(block) for block in re.findall(r'```json\s*\n(.*?)\n```', pr['body'], re.DOTALL)]
        reviews = [row for row in records if type(row) is dict and row.get('schema') == schema]
        need(len(reviews) == 1 and reviews[0].get('scope') == selected_scope
             and reviews[0].get('executionAuthority') is False, phase)
        if phase == 'receiver-review':
            receiver_pr = pr
            need(reviews[0].get('sourceQualificationSHA256') == digest_qualification, phase)
    if selected_mode == PC.END_MODE:
        FUNCTION.verify(restore_function_evidence, request['approval']['restoreFunctionAcceptance'], target,
            digest_qualification, value['restoreAcceptanceReviewSHA256'], git=git, api=api)
    else:
        verify_restore_acceptance(receiver_pr, target, value, request['approval']['restoreAcceptance'], api=api)
    M.verify_ci(api, value['targetCI'], target, 'receiver-ci')
    M.verify_ci(api, value['launcherCI'], launcher, 'launcher-ci')
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
    need(before == target, 'branch')
    after = M.remote(api, 'GET', path, 'branch-readback')
    need(type(after) is dict and after.get('object', {}).get('sha') == target, 'branch-readback')
    validate_approval(value, target, launcher, request, now())


def execute(value, target, launcher, request, *, api, git, now, encrypt, link_provider, ready, state_dir, cleanup=None, restore_function_evidence=None):
    selected_mode, _ = mode_scope(value)
    phase, fd, attempted, accepted = 'approval', None, False, False
    progress = {'branchChanged': False, 'branchUpdateAttempted': False}
    first, secondary = None, []
    result = {'schema': 'helmut-w15-end500-dispatch-attempt/1', 'targetCommit': target,
        'launcherCommit': launcher, 'mode': selected_mode, 'dispatchAttempted': False, 'dispatchAccepted': False,
        'restoreAcceptedByDispatch': False, 'end500Accepted': False, 'retryAllowed': False, 'executionAuthority': False}
    try:
        validate_approval(value, target, launcher, request, now())
        need(value['stateDir'] == str(Path(state_dir)), 'approval')
        nonce = value['nonce']; result['nonce'] = nonce
        phase = 'private-root'; fd = M.private_directory(state_dir)
        M.write_public(fd, 'STARTED_' + nonce + '.SAFE.json', result)
        phase = 'launcher'; prepare(value, target, launcher, request, api=api, git=git, now=now, progress=progress,
            **({'restore_function_evidence': restore_function_evidence} if selected_mode == PC.END_MODE else {}))
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
        payload = N.dispatch_payload(target, armored, mode=selected_mode, extra_inputs={'w15_request': canonical(request).decode('ascii')})
        need(type(payload) is bytes and len(payload) <= 65535, phase)
        phase = 'final-expiry'; validate_approval(value, target, launcher, request, now())
        need((expiry - now()).total_seconds() > M.MIN_LINK_SECONDS, phase)
        phase = 'attempt-marker'
        M.write_public(fd, 'POST_ATTEMPT_' + nonce + '.SAFE.json', {**result, **progress, 'dispatchAttempted': True})
        phase = 'final-expiry'; validate_approval(value, target, launcher, request, now())
        need((expiry - now()).total_seconds() > M.MIN_LINK_SECONDS, phase)
        need(len(payload) <= 65535, 'payload')
        phase = 'dispatch'; attempted = True
        response = api('POST', '/actions/workflows/' + str(WORKFLOW) + '/dispatches', decode(payload))
        need(response is None, phase); accepted = True
    except BaseException as error:
        selected = getattr(error, 'phase', None)
        selected = selected if type(selected) is str else None
        first = selected if selected in PHASES else phase
    finally:
        if cleanup is not None:
            try: cleanup()
            except BaseException: secondary.append('stdin-restore')
        result.update(**progress, dispatchAttempted=attempted, dispatchAccepted=accepted,
            status=('PASS_SINGLE_END500_DISPATCH_SUBMITTED_ACCEPTANCE_PENDING' if accepted else
                    'UNKNOWN_END500_DISPATCH_OUTCOME' if attempted else 'BLOCKED_END500_DISPATCH'),
            firstFailedPhase=first, phase=first or 'dispatch', secondaryCleanupFailures=secondary)
        if secondary:
            result.update(status='FAIL_END500_DISPATCH_CLEANUP_UNCONFIRMED', firstFailedPhase=first or 'cleanup', phase=first or 'cleanup')
        if fd is not None:
            try: M.write_public(fd, 'RESULT_' + value['nonce'] + '.SAFE.json', result)
            except BaseException: secondary.append('result-write')
            try: os.close(fd)
            except BaseException: secondary.append('state-close')
        if secondary:
            result.update(status='FAIL_END500_DISPATCH_CLEANUP_UNCONFIRMED', firstFailedPhase=first or 'cleanup', phase=first or 'cleanup')
    return result


class PrivateLinksInput(F.PrivateLinksInput):
    def ready(self):
        if os.isatty(self.descriptor):
            self.previous = termios.tcgetattr(self.descriptor)
            hidden = list(self.previous); hidden[6] = list(self.previous[6])
            hidden[3] &= ~(termios.ECHO | termios.ICANON)
            hidden[6][termios.VMIN] = hidden[6][termios.VTIME] = 0
            termios.tcsetattr(self.descriptor, termios.TCSANOW, hidden)
        print(READY, flush=True)



def main():
    import argparse
    parser = argparse.ArgumentParser(description='One separately approved complete isolated End500 dispatch')
    parser.add_argument('--plan', action='store_true')
    parser.add_argument('--execute-after-go', action='store_true')
    parser.add_argument('--expected-launcher-commit')
    parser.add_argument('--expected-receiver-commit')
    parser.add_argument('--approval-file')
    parser.add_argument('--request-file')
    parser.add_argument('--state-dir')
    parser.add_argument('--restore-function-evidence-file')
    args = parser.parse_args()
    if not args.execute_after_go:
        print(json.dumps({'status': 'BLOCKED_SEPARATE_END500_GO_REQUIRED', 'mode': MODE,
            'maximumDispatchAttempts': 1, 'sourceParts': 15, 'minimumActualLinkSecondsExclusive': 90,
            'executionAuthority': False}, sort_keys=True)); return 0
    try:
        need(not args.plan and all((args.expected_receiver_commit, args.expected_launcher_commit, args.approval_file, args.request_file, args.state_dir)), 'arguments')
        value, request = public_file(args.approval_file), public_file(args.request_file)
        private_input = PrivateLinksInput()
        result = execute(value, args.expected_receiver_commit, args.expected_launcher_commit, request, api=M.GitHub(), git=Git(),
            now=lambda: datetime.now(timezone.utc), encrypt=N.encrypt_index, link_provider=private_input.read,
            ready=private_input.ready, state_dir=args.state_dir, cleanup=private_input.close,
            **({'restore_function_evidence': public_file(args.restore_function_evidence_file)}
               if args.restore_function_evidence_file else {}))
        print(json.dumps(result, sort_keys=True)); return 0 if result['dispatchAccepted'] and not result['secondaryCleanupFailures'] else 1
    except BaseException as error:
        print(json.dumps({'status': 'BLOCKED_END500_DISPATCH', 'phase':
            error.phase if getattr(error, 'phase', None) in PHASES else 'arguments', 'dispatchAttempted': False,
            'restoreAcceptedByDispatch': False, 'end500Accepted': False, 'retryAllowed': False}, sort_keys=True)); return 1


if __name__ == '__main__': sys.exit(main())
