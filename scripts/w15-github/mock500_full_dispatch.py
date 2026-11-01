"""One separately approved Mock3 dispatch; both private link sets follow READY.

The inert default grants no run authority. Existing GitHub, Git, recipient/GPG,
index and payload helpers are reused. No fetch, secret copy or automatic retry.
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
import termios
import time
import uuid

HERE = Path(__file__).absolute().parent


def component(name):
    spec = importlib.util.spec_from_file_location('w15_mock_full_sender_' + name, HERE / (name + '.py'))
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


E = component('end500_dispatch')
F, M, N, canonical, decode = E.F, E.M, E.N, E.canonical, E.decode
W, S, R = component('mock500_workflow'), component('mock500_start'), component('mock500_receive')
A, D, PC = component('mock500_archive_receive'), component('mock500_original_archive'), E.PC
MODE, SCOPE = PC.MOCK_MODE, PC.SCOPES[PC.MOCK_MODE]
FUNCTIONAL = 'mock500-full-functional-gated'
BRANCH, ENVIRONMENT, WORKFLOW = M.BRANCH, M.ENVIRONMENT, M.WORKFLOW
REVIEW_SCHEMA = 'helmut-w15-independent-mock500-receiver-review/1'
LAUNCHER_REVIEW_SCHEMA = 'helmut-w15-independent-mock500-full-launcher-review/1'
INDEX_SCHEMA = 'helmut-w15-mock500-private-url-index/1'
READY = 'READY_FOR_FRESH_PRIVATE_MOCK500_LINKS'
MAX_FRAME = F.MAX_FRAME
Git, public_file = F.Git, F.public_file
PHASES = E.PHASES | {'end500-acceptance', 'end500-run', 'bridge', 'input-binding', 'start-window'}


class DispatchRejected(ValueError):
    def __init__(self, phase='arguments'):
        self.phase = phase if phase in PHASES else 'arguments'
        super().__init__('MOCK500_FULL_DISPATCH_REJECTED')


def need(value, phase):
    if not value: raise DispatchRejected(phase)


def digest(value):
    return hashlib.sha256(canonical(value)).hexdigest()


def mode_scope(value):
    if type(value) is dict and value.get('scope') == 'ISOLATED_GITHUB_MOCK500_FUNCTIONAL_ONLY':
        return FUNCTIONAL,S.functional().SCOPES[FUNCTIONAL]
    return MODE,SCOPE


def check_start_window(now, mode=MODE):
    # Mirror the unchanged StartGuard's closed date range and its real 12600s
    # completion window. No future run id, changed clock or extended day is used.
    if mode == FUNCTIONAL:
        try:S.functional().validate_window('mock500',now)
        except (ValueError,TypeError,KeyError):raise DispatchRejected('start-window') from None
        return
    completion = now + timedelta(seconds=W.WALL[mode])
    berlin = S.ZoneInfo('Europe/Berlin')
    need('2026-10-28' <= now.date().isoformat() <= '2026-10-31'
         and now.date() == completion.date()
         and now.astimezone(berlin).date() == completion.astimezone(berlin).date(), 'start-window')


def build_index(target, input_binding, urls, issued, expires):
    window = {'expectedCommit': target, 'createdAtUTC': M.iso(issued),
              'expiresAtUTC': M.iso(min(expires, issued + timedelta(minutes=30)))}
    original = {'schema': 'helmut-w15-private-cipher-url-index/1', **window,
                'parts': [{'index': i, 'url': url} for i, url in enumerate(urls[:15], 1)]}
    archive = {'format': A.FORMAT, 'driveId': A.DRIVE_ID, 'cipherBytes': D.CIPHER['bytes'],
               'cipherSHA256': D.CIPHER['sha256'], 'manifestSHA256': D.MANIFEST['sha256'], 'url': urls[15]}
    return {'schema': INDEX_SCHEMA, **window, 'original': original, 'assets': archive,
            'inputBinding': canonical(input_binding).decode('ascii')}


def check_static_input_binding(value, target, request, input_binding, now):
    # Reuse the complete pure receiver validator before requesting real links.
    # This inert frame is never encrypted, dispatched, fetched or presented as
    # real transport evidence; it contains no invented run id or approval.
    urls = ['https://fictional.oaiusercontent.com/STATIC_VALIDATION_ONLY_' + str(i) for i in range(16)]
    try:
        index = build_index(target, input_binding, urls, now, now + timedelta(minutes=30))
        R.checked_index(canonical(index).decode('ascii'), target, now=now,
            input_binding_sha256=value['inputBindingSHA256'], additional_asset_bytes=request['bindings']['additionalAssetBytes'])
    except BaseException: raise DispatchRejected('input-binding') from None


def validate_approval(value, target, launcher, request, now):
    mode,scope=mode_scope(value)
    keys = {'schema', 'scope', 'authorized', 'targetCommit', 'launcherCommit', 'branch', 'environment',
        'workflowId', 'nonce', 'runAttempt', 'maxReceiveAttempts', 'targetCI', 'targetPR', 'reviewSHA256',
        'launcherCI', 'launcherPR', 'launcherReviewSHA256', 'sourceQualificationSHA256', 'end500PR',
        'end500AcceptanceSHA256', 'compatibilitySHA256', 'inputBindingSHA256', 'requestSHA256',
        'advanceAllowedBranch', 'stateDir', 'issuedAt', 'expiresAt'}
    need(type(value) is dict and set(value) == keys and type(target) is str and M.HEX.fullmatch(target)
         and type(launcher) is str and M.HEX.fullmatch(launcher)
         and value['schema'] == 'helmut-w15-mock500-full-dispatch-approval/1'
         and value['scope'] == scope and value['authorized'] is True
         and value['targetCommit'] == target and value['launcherCommit'] == launcher
         and value['branch'] == BRANCH and value['environment'] == ENVIRONMENT
         and type(value['workflowId']) is int and value['workflowId'] == WORKFLOW
         and all(type(value[k]) is int and value[k] > 0 for k in ('targetCI', 'targetPR', 'launcherCI', 'launcherPR', 'end500PR'))
         and value['advanceAllowedBranch'] is False and type(value['stateDir']) is str
         and Path(value['stateDir']).is_absolute() and '..' not in Path(value['stateDir']).parts
         and type(value['runAttempt']) is int and value['runAttempt'] == 1
         and type(value['maxReceiveAttempts']) is int and value['maxReceiveAttempts'] == 1
         and all(type(value[k]) is str and M.SHA.fullmatch(value[k]) for k in (
             'reviewSHA256', 'launcherReviewSHA256', 'sourceQualificationSHA256', 'requestSHA256',
             'end500AcceptanceSHA256', 'compatibilitySHA256', 'inputBindingSHA256')), 'approval')
    nonce = uuid.UUID(value['nonce'])
    need(str(nonce) == value['nonce'] and nonce.version == 4 and nonce.variant == uuid.RFC_4122, 'approval')
    need(type(request) is dict and set(request) == W.DECLARATION_KEYS and digest(request) == value['requestSHA256']
         and request['nonce'] == value['nonce'] and request['limits'] == W.limits(mode)
         and all(type(x) is int for x in request['limits'].values())
         and type(request['maximumWallSeconds']) is int and request['maximumWallSeconds'] == W.WALL[mode], 'approval')
    bindings = request['bindings']
    need(type(bindings) is dict and set(bindings) == {'end500Acceptance', 'compatibilityBridge',
         'inputBindingSHA256', 'additionalAssetBytes', 'approvedEnd500Commit'}
         and bindings['inputBindingSHA256'] == value['inputBindingSHA256']
         and bindings['additionalAssetBytes'] == D.TOTAL and type(bindings['additionalAssetBytes']) is int
         and type(bindings['approvedEnd500Commit']) is str and M.HEX.fullmatch(bindings['approvedEnd500Commit'])
         and (mode == FUNCTIONAL or bindings['approvedEnd500Commit'] != target)
         and bindings['end500Acceptance']['sha256'] == value['end500AcceptanceSHA256']
         and bindings['compatibilityBridge']['sha256'] == value['compatibilitySHA256'], 'approval')
    expected = {'schema': 'helmut-w15-mock500-start-approval/1', 'scope': scope, 'authorized': True,
        'mode': mode, 'exactCommit': target, 'branch': 'refs/heads/' + BRANCH, 'runAttempt': 1,
        'nonce': value['nonce'], 'sourceQualificationSHA256': value['sourceQualificationSHA256'],
        'end500AcceptanceSHA256': value['end500AcceptanceSHA256'], 'compatibilitySHA256': value['compatibilitySHA256'],
        'limits': W.limits(mode), 'processingSeconds': 10800, 'completionSeconds': 12600,
        'expectedProfiles': 500, 'expectedUnits': 500, 'expectedPositions': 1500, 'expectedControls': 8000,
        'maxProviderCalls': 0, 'maxStorageUSD': '0.05', 'maxReceiveAttempts': 1,
        'issuedAt': value['issuedAt'], 'expiresAt': value['expiresAt']}
    approval = request['approval']
    need(type(approval) is dict and approval == expected and approval['authorized'] is True
         and all(type(approval[k]) is int for k in ('runAttempt', 'processingSeconds', 'completionSeconds',
             'expectedProfiles', 'expectedUnits', 'expectedPositions', 'expectedControls', 'maxProviderCalls', 'maxReceiveAttempts'))
         and all(type(x) is int for x in approval['limits'].values()), 'approval')
    issued, expires = S._utc(value['issuedAt']), S._utc(value['expiresAt'])
    need(issued <= now < expires and timedelta(0) < expires - issued <= timedelta(hours=2), 'approval')
    check_start_window(now,mode)


def record_on_pr(pr, envelope, phase, *, commit):
    try: record = S._record(envelope)
    except BaseException: raise DispatchRejected(phase) from None
    need(type(pr) is dict and pr.get('state') == 'open' and pr.get('merged') is False
         and pr.get('head', {}).get('sha') == commit and type(pr.get('body')) is str
         and len(pr['body']) <= 65536, phase)
    try: rows = [decode(raw) for raw in re.findall(r'```json\s*\n(.*?)\n```', pr['body'], re.DOTALL)]
    except BaseException: raise DispatchRejected(phase) from None
    matches = [row for row in rows if type(row) is dict and row.get('schema') == record.get('schema')]
    need(len(matches) == 1 and matches[0] == record, phase)
    return record


def verify_prior(bindings, target, qualification_sha, receiver_pr, end_pr, *, api, mode=MODE):
    """No invented future run id: only the real prior End run is queried here."""
    baseline = bindings['approvedEnd500Commit']
    end = record_on_pr(end_pr, bindings['end500Acceptance'], 'end500-acceptance', commit=baseline)
    if mode == FUNCTIONAL:
        try:S.validate_functional_end_acceptance(end)
        except (ValueError,RuntimeError,TypeError,KeyError):raise DispatchRejected('end500-acceptance') from None
    need((mode == FUNCTIONAL or (end.get('schema') == 'helmut-w15-independent-end500-acceptance/2'
         and end.get('status') == 'PASS_INDEPENDENT_GITHUB_END500_PHASED_ACCEPTANCE'
         and end.get('scope') == PC.SCOPES[PC.END_MODE] and end.get('exactCommit') == baseline
         and end.get('resourceContract') == PC.END_PROFILE
         and all(end.get(key) is True for key in ('processingMemoryAccepted', 'backupSafetyAccepted',
             'independentRestoreFunctionAccepted', 'completeBackupAccepted'))
         and end.get('commonLifetimeMemoryAccepted') is False))
         and end.get('exactCommit') == baseline
         and type(end.get('runId')) is str and re.fullmatch('[1-9][0-9]{4,19}', end['runId'])
         and type(end.get('runAttempt')) is int and end['runAttempt'] == 1
         and type(end.get('receiptSHA256')) is str and M.SHA.fullmatch(end['receiptSHA256'])
         and type(end.get('profiles')) is int and end['profiles'] == 500
         and type(end.get('activeProfiles')) is int and end['activeProfiles'] == 0
         and end.get('inputManifestSHA') == S.INPUT_SHA and end.get('recipientFingerprint') == S.FINGERPRINT
         and all(end.get(key) is False for key in ('productionAcceptance', 'mock500Acceptance', 'executionAuthority')), 'end500-acceptance')
    bridge = record_on_pr(receiver_pr, bindings['compatibilityBridge'], 'bridge', commit=target)
    need(bridge.get('schema') == 'helmut-w15-mock500-baseline-bridge/1'
         and bridge.get('status') == 'PASS_INDEPENDENT_BASELINE_COMPATIBILITY_REVIEW'
         and bridge.get('baselineExactCommit') == baseline and bridge.get('mockExactCommit') == target
         and bridge.get('sourceQualificationSHA256') == qualification_sha
         and bridge.get('end500AcceptanceSHA256') == bindings['end500Acceptance']['sha256']
         and bridge.get('inputManifestSHA') == S.INPUT_SHA and bridge.get('recipientFingerprint') == S.FINGERPRINT
         and bridge.get('mockMemoryContract') == S.memory_profile(mode)
         and bridge.get('end500CodeReexecuted') is False and bridge.get('executionAuthority') is False, 'bridge')
    if mode == FUNCTIONAL:need(bridge.get('functionalContract')==S.functional().CONTRACT,'bridge')
    if mode == FUNCTIONAL and end.get('schema') == S.host_functional().ACCEPTANCE_SCHEMA:
        need(bridge.get('end500FunctionalContract') == S.host_functional().CONTRACT,'bridge')
    try: run = api('GET', '/actions/runs/' + end['runId'])
    except BaseException: raise DispatchRejected('end500-run') from None
    need(type(run) is dict and type(run.get('id')) is int and str(run['id']) == end['runId']
         and run.get('head_sha') == baseline and run.get('head_branch') == BRANCH
         and run.get('event') == 'workflow_dispatch' and run.get('status') == 'completed'
         and run.get('conclusion') == 'success' and type(run.get('run_attempt')) is int and run['run_attempt'] == 1
         and run.get('workflow_id') == WORKFLOW, 'end500-run')


def prepare(value, target, launcher, request, input_binding, *, api, git, now):
    mode,scope=mode_scope(value)
    validate_approval(value, target, launcher, request, now())
    git.check_launcher(launcher)
    raw, qualification_sha, qualification = E.W.decode_qualification(request['sourceQualification'])
    need(qualification['exactCommit'] == target and qualification_sha == value['sourceQualificationSHA256'], 'qualification')
    try: git.qualify(target, qualification)
    except BaseException: raise DispatchRejected('qualification') from None
    need(type(input_binding) is dict and digest(input_binding) == value['inputBindingSHA256']
         and input_binding.get('exactCommit') == target, 'input-binding')
    check_static_input_binding(value, target, request, input_binding, now())
    F.source_parts()
    receiver_pr = None
    for commit, pr_id, schema, review_sha, phase in (
        (target, value['targetPR'], REVIEW_SCHEMA, value['reviewSHA256'], 'receiver-review'),
        (launcher, value['launcherPR'], LAUNCHER_REVIEW_SCHEMA, value['launcherReviewSHA256'], 'launcher-review')):
        pr = M.remote(api, 'GET', '/pulls/' + str(pr_id), phase)
        M.verify_review(pr, commit, schema, review_sha, phase)
        reviews = [decode(block) for block in re.findall(r'```json\s*\n(.*?)\n```', pr['body'], re.DOTALL)]
        reviews = [row for row in reviews if type(row) is dict and row.get('schema') == schema]
        need(len(reviews) == 1 and reviews[0].get('scope') == scope and reviews[0].get('executionAuthority') is False, phase)
        if phase == 'receiver-review':
            receiver_pr = pr
            need(reviews[0].get('sourceQualificationSHA256') == qualification_sha
                 and reviews[0].get('inputBindingSHA256') == value['inputBindingSHA256'], phase)
    try: end_pr = api('GET', '/pulls/' + str(value['end500PR']))
    except BaseException: raise DispatchRejected('end500-acceptance') from None
    verify_prior(request['bindings'], target, qualification_sha, receiver_pr, end_pr, api=api,mode=mode)
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
    for phase in ('branch', 'branch-readback'):
        ref = M.remote(api, 'GET', '/git/ref/heads/' + BRANCH, phase)
        need(type(ref) is dict and ref.get('object', {}).get('sha') == target, phase)
    validate_approval(value, target, launcher, request, now())


def execute(value, target, launcher, request, input_binding, *, api, git, now, encrypt, link_provider, ready, state_dir, cleanup=None):
    phase, fd, attempted, accepted, first, secondary = 'approval', None, False, False, None, []
    mode,_=mode_scope(value)
    result = {'schema': 'helmut-w15-mock500-full-dispatch-attempt/1', 'mode': mode,
        'targetCommit': target, 'launcherCommit': launcher, 'branchChanged': False,
        'dispatchAttempted': False, 'dispatchAccepted': False, 'mock500Accepted': False,
        'originalReceptionAccepted': False, 'retryAllowed': False, 'executionAuthority': False}
    try:
        validate_approval(value, target, launcher, request, now())
        need(value['stateDir'] == str(Path(state_dir)), 'approval')
        nonce = value['nonce']; result['nonce'] = nonce
        phase = 'private-root'; fd = M.private_directory(state_dir)
        M.write_public(fd, 'STARTED_' + nonce + '.SAFE.json', result)
        phase = 'launcher'
        prepare(value, target, launcher, request, input_binding, api=api, git=git, now=now)
        phase = 'link'; ready(); links = link_provider()
        need(type(links) is dict and set(links) == {'original', 'archive'}
             and type(links['original']) is list and len(links['original']) == 15, phase)
        checked = [M.signed_link(url, now()) for url in [*links['original'], links['archive']]]
        need(len({row[0] for row in checked}) == 16, phase)
        # All GitHub GETs and code/review checks precede READY. Only local work
        # remains before the sole POST; both packages share the shortest expiry.
        phase = 'index'; issued = now(); expiry = min(row[1] for row in checked)
        index = build_index(target, input_binding, [row[0] for row in checked], issued, expiry)
        R.checked_index(canonical(index).decode('ascii'), target, now=issued,
            input_binding_sha256=value['inputBindingSHA256'], additional_asset_bytes=request['bindings']['additionalAssetBytes'])
        phase = 'encryption'; armored = encrypt(canonical(index).decode('ascii'), target, Path(state_dir), index_schema=INDEX_SCHEMA)
        phase = 'payload'
        payload = N.dispatch_payload(target, armored, mode=mode, extra_inputs={'w15_request': canonical(request).decode('ascii')})
        need(type(payload) is bytes and len(payload) <= 65535, phase)
        body = decode(payload)
        phase = 'final-expiry'; validate_approval(value, target, launcher, request, now())
        need((expiry - now()).total_seconds() > M.MIN_LINK_SECONDS, phase)
        phase = 'attempt-marker'
        M.write_public(fd, 'POST_ATTEMPT_' + nonce + '.SAFE.json', {**result, 'dispatchAttempted': True})
        phase = 'final-expiry'; validate_approval(value, target, launcher, request, now())
        need((expiry - now()).total_seconds() > M.MIN_LINK_SECONDS, phase)
        need(len(payload) <= 65535, 'payload')
        phase = 'dispatch'; attempted = True
        response = api('POST', '/actions/workflows/' + str(WORKFLOW) + '/dispatches', body)
        need(response is None, phase); accepted = True
    except BaseException as error:
        selected = getattr(error, 'phase', None)
        first = selected if type(selected) is str and selected in PHASES else phase
    finally:
        if cleanup is not None:
            try: cleanup()
            except BaseException: secondary.append('stdin-restore')
        result.update(dispatchAttempted=attempted, dispatchAccepted=accepted,
            status=('PASS_SINGLE_MOCK500_DISPATCH_SUBMITTED_ACCEPTANCE_PENDING' if accepted else
                    'UNKNOWN_MOCK500_DISPATCH_OUTCOME' if attempted else 'BLOCKED_MOCK500_DISPATCH'),
            firstFailedPhase=first, phase=first or 'dispatch', secondaryCleanupFailures=secondary)
        if secondary:
            result.update(status='FAIL_MOCK500_DISPATCH_CLEANUP_UNCONFIRMED', firstFailedPhase=first or 'cleanup', phase=first or 'cleanup')
        if fd is not None:
            try: M.write_public(fd, 'RESULT_' + value['nonce'] + '.SAFE.json', result)
            except BaseException: secondary.append('result-write')
            try: os.close(fd)
            except BaseException: secondary.append('state-close')
        if secondary:
            result.update(status='FAIL_MOCK500_DISPATCH_CLEANUP_UNCONFIRMED', firstFailedPhase=first or 'cleanup', phase=first or 'cleanup')
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
            need(type(value) is dict and set(value) == {'original', 'archive'}
                 and type(value['original']) is list and len(value['original']) == 15
                 and all(type(url) is str for url in [*value['original'], value['archive']]), 'link')
            return value
        finally: self.close()


def main():
    import argparse
    parser = argparse.ArgumentParser(description='One separately approved complete isolated Mock3 dispatch')
    parser.add_argument('--plan', action='store_true')
    parser.add_argument('--execute-after-go', action='store_true')
    for name in ('expected-launcher-commit', 'expected-receiver-commit', 'approval-file', 'request-file', 'input-binding-file', 'state-dir'):
        parser.add_argument('--' + name)
    args = parser.parse_args()
    if not args.execute_after_go:
        print(json.dumps({'status': 'BLOCKED_SEPARATE_MOCK500_GO_AND_POSITIVE_END500_REQUIRED', 'mode': MODE,
            'maximumDispatchAttempts': 1, 'sourceParts': 15, 'additionalOriginalFiles': 11,
            'minimumActualLinkSecondsExclusive': 90, 'executionAuthority': False}, sort_keys=True)); return 0
    try:
        need(not args.plan and all((args.expected_launcher_commit, args.expected_receiver_commit,
            args.approval_file, args.request_file, args.input_binding_file, args.state_dir)), 'arguments')
        private_input = PrivateLinksInput()
        result = execute(public_file(args.approval_file), args.expected_receiver_commit, args.expected_launcher_commit,
            public_file(args.request_file), public_file(args.input_binding_file), api=M.GitHub(), git=Git(),
            now=lambda: datetime.now(timezone.utc), encrypt=N.encrypt_index, link_provider=private_input.read,
            ready=private_input.ready, state_dir=args.state_dir, cleanup=private_input.close)
        print(json.dumps(result, sort_keys=True)); return 0 if result['dispatchAccepted'] and not result['secondaryCleanupFailures'] else 1
    except BaseException as error:
        print(json.dumps({'status': 'BLOCKED_MOCK500_DISPATCH', 'phase':
            error.phase if getattr(error, 'phase', None) in PHASES else 'arguments', 'dispatchAttempted': False,
            'mock500Accepted': False, 'retryAllowed': False}, sort_keys=True)); return 1


if __name__ == '__main__': sys.exit(main())
