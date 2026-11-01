"""Read GitHub protection metadata only; never transfer data or grant access.

The public end500-plan job needs no private input and must not use this gate as
a reason to attach an Environment. A matching Environment name or local runtime
variable proves no protection. Only fresh GET responses from api.github.com are
examined; no caller-supplied metadata files or secret endpoints are accepted.
"""
import sys
sys.dont_write_bytecode = True

import argparse
from datetime import datetime, timezone
import json
import re
import subprocess

REPOSITORY = 'ernisch/helmut-pilot'
ENVIRONMENT = 'helmut-ci-originals'
ENVIRONMENT_ID = 25001443837
BRANCH = 'codex/w15-github-end500-preparation-20261028'
BASE = f'repos/{REPOSITORY}'
ENV_PATH = f'{BASE}/environments/{ENVIRONMENT}'
POLICIES_PATH = ENV_PATH + '/deployment-branch-policies?per_page=100&page=1'
REF_PATH = f'{BASE}/git/ref/heads/{BRANCH}'
ENDPOINTS = (ENV_PATH, POLICIES_PATH, REF_PATH)
PASS, FAIL, UNKNOWN = 'PASS', 'FAIL', 'UNKNOWN'


class Parser(argparse.ArgumentParser):
    def error(self, message):
        raise ValueError('ARGUMENTS_REJECTED')


def query(endpoint):
    """Fixed host, GET-only allowlist, no raw response/error/credential output."""
    if endpoint not in ENDPOINTS:
        raise ValueError('ENDPOINT_REJECTED')
    try:
        result = subprocess.run(
            # gh adds the api. prefix for GitHub.com; api.github.com here
            # would incorrectly request api.api.github.com.
            ('gh', 'api', '--hostname', 'github.com', '--method', 'GET',
             '-H', 'Accept: application/vnd.github+json',
             '-H', 'X-GitHub-Api-Version: 2022-11-28', endpoint),
            stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL, timeout=25, check=False, shell=False,
            close_fds=True)
        if result.returncode != 0 or len(result.stdout) > 262144:
            return None
        value = json.loads(result.stdout)
        return value if type(value) is dict else None
    except (OSError, ValueError, subprocess.SubprocessError):
        return None


def positive_id(value):
    return type(value) is int and value > 0


def bool_check(value, expected):
    if type(value) is not bool:
        return UNKNOWN
    return PASS if value is expected else FAIL


def evaluate(environment, policies, ref, expected_commit):
    """Pure evaluator; a passing result proves metadata prerequisites ONLY."""
    if not isinstance(expected_commit, str) or not re.fullmatch('[0-9a-f]{40}', expected_commit):
        raise ValueError('COMMIT_REJECTED')
    checks = dict.fromkeys(('environmentIdentity', 'adminBypassDisabled',
                            'customBranchPoliciesOnly', 'exactBranchPolicy',
                            'branchHeadMatchesCommit'), UNKNOWN)
    # Operator's solo-development contract: human reviewer governance is
    # informational, independent of these strict technical metadata bindings.
    reviewer_controls = {'status': 'INFO_ONLY', 'requiredForMetadataAcceptance': False,
                         'requiredReviewersConfigured': UNKNOWN, 'selfReviewPrevented': UNKNOWN}
    if type(environment) is dict:
        checks['environmentIdentity'] = PASS if (
            type(environment.get('id')) is int and environment['id'] == ENVIRONMENT_ID
            and environment.get('name') == ENVIRONMENT) else FAIL
        checks['adminBypassDisabled'] = bool_check(environment.get('can_admins_bypass'), False)
        rules = environment.get('protection_rules')
        if type(rules) is list and all(type(rule) is dict for rule in rules):
            review_rules = [rule for rule in rules if rule.get('type') == 'required_reviewers']
            if len(review_rules) == 0:
                reviewer_controls['requiredReviewersConfigured'] = 'NOT_CONFIGURED'
                reviewer_controls['selfReviewPrevented'] = 'NOT_CONFIGURED'
            elif len(review_rules) == 1:
                rule = review_rules[0]
                reviewers = rule.get('reviewers')
                if type(reviewers) is list:
                    valid = 1 <= len(reviewers) <= 6 and all(
                        type(item) is dict and item.get('type') in ('User', 'Team')
                        and type(item.get('reviewer')) is dict
                        and positive_id(item['reviewer'].get('id')) for item in reviewers)
                    reviewer_controls['requiredReviewersConfigured'] = 'CONFIGURED' if valid else 'NOT_CONFIGURED'
                self_review = rule.get('prevent_self_review')
                if type(self_review) is bool:
                    reviewer_controls['selfReviewPrevented'] = 'ENABLED' if self_review else 'DISABLED'
        branch_policy = environment.get('deployment_branch_policy')
        if 'deployment_branch_policy' in environment and branch_policy is None:
            checks['customBranchPoliciesOnly'] = FAIL
        elif type(branch_policy) is dict:
            values = (bool_check(branch_policy.get('protected_branches'), False),
                      bool_check(branch_policy.get('custom_branch_policies'), True))
            checks['customBranchPoliciesOnly'] = (UNKNOWN if UNKNOWN in values else
                                                  PASS if all(v == PASS for v in values) else FAIL)
    if type(policies) is dict:
        count, rows = policies.get('total_count'), policies.get('branch_policies')
        if type(count) is int and count >= 0 and type(rows) is list and count == len(rows):
            if count != 1:
                checks['exactBranchPolicy'] = FAIL
            elif type(rows[0]) is dict:
                row = rows[0]
                # Missing type is UNKNOWN: GitHub supports both branch and tag
                # policies; older examples omit type and cannot prove a branch.
                if row.get('type') in ('branch', 'tag') and positive_id(row.get('id')):
                    checks['exactBranchPolicy'] = PASS if (
                        row['type'] == 'branch' and row.get('name') == BRANCH) else FAIL
    if type(ref) is dict and type(ref.get('object')) is dict:
        obj = ref['object']
        if isinstance(obj.get('sha'), str) and re.fullmatch('[0-9a-f]{40}', obj['sha']):
            checks['branchHeadMatchesCommit'] = PASS if (
                ref.get('ref') == 'refs/heads/' + BRANCH and obj.get('type') == 'commit'
                and obj['sha'] == expected_commit) else FAIL
    passed = all(value == PASS for value in checks.values())
    return {'status': ('PASS_GITHUB_PROTECTION_METADATA_ONLY_START_BLOCKED' if passed else
                       'BLOCKED_GITHUB_PROTECTION_METADATA'),
            'checks': checks, 'reviewerControls': reviewer_controls,
            'protectionMetadataVerified': passed,
            'readiness': 'BLOCKED', 'executionAuthority': False,
            'privateHandoffAuthorized': False, 'secretAccessVerified': False,
            'workflowEnvironmentBindingVerified': False, 'runApprovalVerified': False,
            'testStarted': False}


def main(argv=None):
    try:
        parser = Parser(description=__doc__, add_help=False, allow_abbrev=False)
        parser.add_argument('--check-protection-metadata-only', action='store_true', required=True)
        parser.add_argument('--expected-branch', required=True)
        parser.add_argument('--expected-commit', required=True)
        args = parser.parse_args(argv)
        if args.expected_branch != BRANCH or not re.fullmatch('[0-9a-f]{40}', args.expected_commit):
            raise ValueError('BINDING_REJECTED')
        result = evaluate(*(query(endpoint) for endpoint in ENDPOINTS), args.expected_commit)
        result['observedAtUTC'] = datetime.now(timezone.utc).isoformat()
        result['environmentId'] = ENVIRONMENT_ID
        code = 0 if result['protectionMetadataVerified'] else 1
    except (Exception, KeyboardInterrupt):
        result = evaluate(None, None, None, '0' * 40)
        result['status'] = 'BLOCKED_GITHUB_METADATA_CHECK_UNAVAILABLE'
        code = 1
    print(json.dumps(result, separators=(',', ':')))
    return code


if __name__ == '__main__':
    raise SystemExit(main())
