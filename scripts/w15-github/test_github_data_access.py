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
        self.check_closed(result)

    def test_name_only_and_current_unprotected_environment_fail(self):
        for environment in ({'name': G.ENVIRONMENT},
                            {'id': G.ENVIRONMENT_ID, 'name': G.ENVIRONMENT, 'can_admins_bypass': True,
                             'protection_rules': [], 'deployment_branch_policy': None}):
            result = G.evaluate(environment, None, None, SHA)
            self.assertFalse(result['protectionMetadataVerified'])
            self.check_closed(result)

    def test_reviewers_self_review_admin_bypass_and_recreated_identity_are_independent(self):
        for field, value in (('can_admins_bypass', True), ('can_admins_bypass', None),
                             ('can_admins_bypass', 0), ('id', G.ENVIRONMENT_ID + 1),
                             ('protection_rules', []), ('deployment_branch_policy', None)):
            env, policies, ref = fixture()
            env[field] = value
            self.assertFalse(G.evaluate(env, policies, ref, SHA)['protectionMetadataVerified'])
        for field, value in (('prevent_self_review', False), ('prevent_self_review', 1),
                             ('reviewers', []), ('reviewers', [{'type': 'User', 'id': 123}]),
                             ('reviewers', [{'type': 'Team', 'reviewer': {'id': True}}])):
            env, policies, ref = fixture()
            env['protection_rules'][0][field] = value
            self.assertFalse(G.evaluate(env, policies, ref, SHA)['protectionMetadataVerified'])

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
