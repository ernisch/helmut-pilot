"""Fictional metadata only; no network, Secrets API or data transfer."""
import contextlib
import copy
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('w15_github_data_access', Path(__file__).with_name('github_data_access.py'))
G = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(G)
SHA = 'a' * 40


def fixture():
    return ({'id': G.ENVIRONMENT_ID, 'name': G.ENVIRONMENT, 'can_admins_bypass': False,
             'protection_rules': [{'type': 'required_reviewers', 'prevent_self_review': True,
                                   'reviewers': [{'type': 'User', 'reviewer': {'id': 123}}]}],
             'deployment_branch_policy': {'protected_branches': False, 'custom_branch_policies': True}},
            {'total_count': 1, 'branch_policies': [{'id': 12, 'name': G.BRANCH, 'type': 'branch'}]},
            {'ref': 'refs/heads/' + G.BRANCH, 'object': {'type': 'commit', 'sha': SHA}})


class MetadataChecks(unittest.TestCase):
    def check_closed(self, result):
        self.assertEqual(result['readiness'], 'BLOCKED')
        for key in ('executionAuthority', 'privateHandoffAuthorized', 'secretAccessVerified',
                    'workflowEnvironmentBindingVerified', 'runApprovalVerified', 'testStarted'):
            self.assertFalse(result[key])

    def test_metadata_success_never_grants_runtime_secret_or_start_authority(self):
        result = G.evaluate(*fixture(), SHA)
        self.assertTrue(result['protectionMetadataVerified'])
        self.assertEqual(result['reviewerControls'], {
            'status': 'INFO_ONLY', 'requiredForMetadataAcceptance': False,
            'requiredReviewersConfigured': 'CONFIGURED', 'selfReviewPrevented': 'ENABLED'})
        self.check_closed(result)

    def test_name_only_and_current_unprotected_environment_fail(self):
        for environment in ({'name': G.ENVIRONMENT},
                            {'id': G.ENVIRONMENT_ID, 'name': G.ENVIRONMENT, 'can_admins_bypass': True,
                             'protection_rules': [], 'deployment_branch_policy': None}):
            result = G.evaluate(environment, None, None, SHA)
            self.assertFalse(result['protectionMetadataVerified'])
            self.check_closed(result)

    def test_admin_bypass_and_recreated_identity_are_mandatory(self):
        for field, value in (('can_admins_bypass', True), ('can_admins_bypass', None),
                             ('can_admins_bypass', 0), ('id', G.ENVIRONMENT_ID + 1),
                             ('deployment_branch_policy', None)):
            env, policies, ref = fixture()
            env[field] = value
            self.assertFalse(G.evaluate(env, policies, ref, SHA)['protectionMetadataVerified'])

    def test_reviewer_controls_are_informational_for_solo_metadata_acceptance(self):
        for rules, expected in (([], ('NOT_CONFIGURED', 'NOT_CONFIGURED')),
                                (None, (G.UNKNOWN, G.UNKNOWN))):
            env, policies, ref = fixture()
            env['protection_rules'] = rules
            result = G.evaluate(env, policies, ref, SHA)
            self.assertTrue(result['protectionMetadataVerified'])
            self.assertEqual(result['reviewerControls']['requiredReviewersConfigured'], expected[0])
            self.assertEqual(result['reviewerControls']['selfReviewPrevented'], expected[1])
            self.assertNotIn('requiredReviewersConfigured', result['checks'])
            self.assertNotIn('selfReviewPrevented', result['checks'])
            self.check_closed(result)
        for field, value in (('prevent_self_review', False), ('prevent_self_review', 1),
                             ('reviewers', []), ('reviewers', [{'type': 'User', 'id': 123}]),
                             ('reviewers', [{'type': 'Team', 'reviewer': {'id': True}}])):
            env, policies, ref = fixture()
            env['protection_rules'][0][field] = value
            result = G.evaluate(env, policies, ref, SHA)
            self.assertTrue(result['protectionMetadataVerified'])
            self.assertFalse(result['reviewerControls']['requiredForMetadataAcceptance'])
            self.check_closed(result)

    def test_solo_mode_keeps_every_required_metadata_gate_fail_closed(self):
        changes = (
            ('environmentIdentity', lambda e, p, r: e.update(id=G.ENVIRONMENT_ID + 1)),
            ('adminBypassDisabled', lambda e, p, r: e.update(can_admins_bypass=None)),
            ('customBranchPoliciesOnly', lambda e, p, r: e.update(deployment_branch_policy=None)),
            ('exactBranchPolicy', lambda e, p, r: p['branch_policies'][0].pop('type')),
            ('branchHeadMatchesCommit', lambda e, p, r: r['object'].update(sha='b' * 40)))
        for key, change in changes:
            env, policies, ref = fixture()
            env['protection_rules'] = []
            change(env, policies, ref)
            result = G.evaluate(env, policies, ref, SHA)
            self.assertNotEqual(result['checks'][key], G.PASS)
            self.assertFalse(result['protectionMetadataVerified'])
            self.check_closed(result)

    def test_tag_missing_type_wildcard_extra_and_incomplete_policies_block(self):
        for change in ({'type': 'tag'}, {'type': None}, {'name': 'codex/*'}, {'name': 'main'}):
            env, policies, ref = fixture()
            policies['branch_policies'][0].update(change)
            self.assertFalse(G.evaluate(env, policies, ref, SHA)['protectionMetadataVerified'])
        for count in (0, 2, 101, True):
            env, policies, ref = fixture()
            policies['total_count'] = count
            self.assertFalse(G.evaluate(env, policies, ref, SHA)['protectionMetadataVerified'])
        env, policies, ref = fixture()
        policies['branch_policies'].append(copy.deepcopy(policies['branch_policies'][0]))
        policies['total_count'] = 2
        self.assertFalse(G.evaluate(env, policies, ref, SHA)['protectionMetadataVerified'])

    def test_remote_ref_type_name_sha_drift_and_unknown_metadata_block(self):
        for field, value in (('type', 'tag'), ('sha', 'b' * 40), ('sha', None)):
            env, policies, ref = fixture()
            ref['object'][field] = value
            self.assertFalse(G.evaluate(env, policies, ref, SHA)['protectionMetadataVerified'])
        env, policies, ref = fixture()
        ref['ref'] = 'refs/tags/' + G.BRANCH
        self.assertFalse(G.evaluate(env, policies, ref, SHA)['protectionMetadataVerified'])
        for missing in range(3):
            args = list(fixture()); args[missing] = None
            self.assertFalse(G.evaluate(*args, SHA)['protectionMetadataVerified'])

    def test_invalid_caller_binding_never_queries_or_echoes_argument(self):
        for argv in ([], ['--run'], ['--expected-commit', 'fictional-do-not-echo'],
                     ['--check-protection-metadata-only', '--expected-branch', 'main', '--expected-commit', SHA],
                     ['--check-protection-metadata-only', '--expected-branch', G.BRANCH, '--expected-commit', 'A' * 40]):
            with patch.object(G, 'query') as query, contextlib.redirect_stdout(io.StringIO()) as out:
                self.assertEqual(G.main(argv), 1)
            query.assert_not_called()
            self.assertNotIn('fictional-do-not-echo', out.getvalue())
            self.check_closed(json.loads(out.getvalue()))

    def test_transport_is_get_only_fixed_host_no_secrets_and_discards_failed_output(self):
        with patch.object(G.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, b'{}')) as run:
            for endpoint in G.ENDPOINTS:
                self.assertEqual(G.query(endpoint), {})
            for call in run.call_args_list:
                args, options = call.args[0], call.kwargs
                self.assertEqual(args[2:7], ('--hostname', 'github.com', '--method', 'GET', '-H'))
                self.assertFalse(options['shell'])
                self.assertEqual(options['stderr'], subprocess.DEVNULL)
                self.assertNotIn('secrets', args[-1])
            with self.assertRaises(ValueError):
                G.query(G.ENV_PATH + '/secrets')
            self.assertEqual(run.call_count, 3)
        for raw in (b'[]', b'not-json', b'{}' * 140000):
            with patch.object(G.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, raw)):
                self.assertIsNone(G.query(G.ENV_PATH))
        with patch.object(G.subprocess, 'run', return_value=subprocess.CompletedProcess([], 403, b'fictional-sensitive-error')):
            self.assertIsNone(G.query(G.ENV_PATH))


if __name__ == '__main__':
    unittest.main()
