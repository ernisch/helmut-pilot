"""Pure receipt projections only; no API, filesystem secrets or provider."""
import sys
sys.dont_write_bytecode = True
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('receipt_publish_test', Path(__file__).with_name('publish_synthetic_resource_receipt.py'))
P = importlib.util.module_from_spec(spec); spec.loader.exec_module(P)


class ReceiptChecks(unittest.TestCase):
    def setUp(self):
        self.env = {'GITHUB_ACTIONS': 'true', 'GITHUB_REPOSITORY': 'ernisch/helmut-pilot',
            'GITHUB_EVENT_NAME': 'workflow_dispatch', 'GITHUB_REF': P.REF,
            'GITHUB_SHA': 'a' * 40, 'SOURCE_HEAD_SHA': 'a' * 40, 'GITHUB_RUN_ID': '123456',
            'GITHUB_TOKEN': 'FICTIONAL_TOKEN_NEVER_PUBLISHED'}
        self.report = {'schema': P.SCHEMA, 'exactCommit': 'a' * 40,
            'status': 'FAIL_OR_UNKNOWN_SYNTHETIC_RESOURCE_DIAGNOSTIC',
            'components': {'application': {'kernelLifetimePeakBytes': 'UNKNOWN'}},
            **dict.fromkeys(P.FALSE_FLAGS, False)}

    def test_neutral_closed_receipt_preserves_unknown_without_approval(self):
        value = P.prepare(self.report, self.env)
        self.assertEqual(value['conclusion'], 'neutral')
        self.assertIn('UNKNOWN', value['output']['text'])
        self.assertNotIn(self.env['GITHUB_TOKEN'], value['output']['text'])

    def test_wrong_authority_scope_commit_and_sensitive_values_rejected(self):
        for key, value in [('providerParityAccepted', True), ('exactCommit', 'b' * 40),
                           ('password', 'fictional-local-secret'), ('unexpected', self.env['GITHUB_TOKEN'])]:
            report = copy.deepcopy(self.report); report[key] = value
            with self.assertRaises(AssertionError): P.prepare(report, self.env)
        env = dict(self.env, GITHUB_REF='refs/heads/main')
        with self.assertRaises(AssertionError): P.prepare(self.report, env)

    def test_pr_receipt_uses_head_check_but_retains_actual_merge_commit(self):
        env = dict(self.env, GITHUB_EVENT_NAME='pull_request', GITHUB_REF='refs/pull/1004/merge',
                   GITHUB_HEAD_REF=P.REF.removeprefix('refs/heads/'), SOURCE_HEAD_SHA='b' * 40)
        self.assertEqual(P.prepare(self.report, env)['head_sha'], 'b' * 40)
        self.assertIn('a' * 40, P.prepare(self.report, env)['output']['text'])

    def test_arbitrary_top_and_nested_fields_cannot_publish_private_content(self):
        for report in ({**self.report, 'note': 'FICTIONAL_PRIVATE_CONTENT'},
                {**self.report, 'components': {'application': {'note': 'FICTIONAL_PRIVATE_CONTENT'}}}):
            with self.assertRaises(AssertionError): P.prepare(report, self.env)
        report = copy.deepcopy(self.report)
        report['components']['application']['status'] = 'FICTIONAL_PRIVATE_CONTENT'
        value = P.prepare(report, self.env)
        self.assertNotIn('FICTIONAL_PRIVATE_CONTENT', value['output']['text'])
        self.assertIn('UNKNOWN', value['output']['text'])

    def test_complete_invented_producer_shape_survives_closed_public_projection(self):
        spec=importlib.util.spec_from_file_location('fictional_resource_shapes',
            Path(__file__).with_name('test_synthetic_resource_diagnostic.py'))
        F=importlib.util.module_from_spec(spec);spec.loader.exec_module(F)
        with tempfile.TemporaryDirectory() as root:
            supervisor=F.D.Supervisor(F.state(root));raw=F.kernel()
            for phase in F.D.PHASES:
                supervisor.phase=phase
                for role in ('common-parent','application','database','test-tools'):
                    supervisor.record_phase(role,raw)
            supervisor.metrics={role:{'first':raw,'last':raw,'categoryMaxima':{},'kernelPeakFirstObserved':None}
                                for role in ('application','database','test-tools')}
            def scenario(count):
                result=F.app_result(count);supervisor.workload_results.append(result);return result
            with patch.object(supervisor,'create_groups'),patch.object(supervisor,'stage'), \
                    patch.object(supervisor,'start_database'),patch.object(supervisor,'scenario',side_effect=scenario), \
                    patch.object(supervisor,'close'):
                report=supervisor.run()
            report.update(finalCommonParentAfterOwnedExits='UNKNOWN',parentStoppedAndRemoved='UNKNOWN',
                outsideOuterLauncherMemoryBytes='UNKNOWN_NOT_IN_COMMON_PARENT',commonIsWholeGitHubHostConsumption=False)
            value=P.prepare(report,self.env)
            published=json.loads(value['output']['text'].split('```json\n')[1].rsplit('\n```',1)[0])
            self.assertEqual(published['components']['application']['last']['memory']['kernelLifetimePeakBytes'],20000)
            self.assertIn('synthetic500',published['phaseMeasurements'])


if __name__ == '__main__': unittest.main()
