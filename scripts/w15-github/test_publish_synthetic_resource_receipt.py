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
            'GITHUB_SHA': 'a' * 40, 'SOURCE_HEAD_SHA': 'a' * 40, 'GITHUB_RUN_ID': '123456789',
            'GITHUB_TOKEN': 'FICTIONAL_TOKEN_NEVER_PUBLISHED'}
        self.report = {'schema': P.SCHEMA, 'exactCommit': 'a' * 40,
            'scope': 'ORIGINAL_FREE_SYNTHETIC_500_CAPACITY_ONLY',
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
        self.report['scope'] = 'ORIGINAL_FREE_SYNTHETIC_3_PROFILE_CONNECTION_QUALIFICATION_ONLY'
        self.assertEqual(P.prepare(self.report, env)['head_sha'], 'b' * 40)
        self.assertIn('a' * 40, P.prepare(self.report, env)['output']['text'])

    def test_new_kernel_event_is_omitted_without_losing_reviewed_counters(self):
        report={**self.report,'lastCommonParent':{'events':{'max':0,'oom':0,'oom_kill':0,
            'oom_group_kill':0,'new_unreviewed_kernel_counter':0}}}
        value=P.prepare(report,self.env)
        self.assertNotIn('new_unreviewed_kernel_counter',value['output']['text'])
        self.assertIn('"oom_kill": 0',value['output']['text'])

    def test_first_failure_remains_readable_when_whole_receipt_projection_rejects(self):
        report={**self.report,'firstFailure':{'phase':'schema','code':'WORKLOAD_PROCESS_FAILED'},
                'unapprovedNote':'FICTIONAL_PRIVATE_SENTINEL'}
        with self.assertRaises(AssertionError):P.prepare(report,self.env)
        notice=P.compact_notice(report)
        self.assertIn('WORKLOAD_PROCESS_FAILED',notice)
        self.assertNotIn('FICTIONAL_PRIVATE_SENTINEL',notice)
        self.assertNotIn('unapprovedNote',notice)

    def test_event_scope_status_and_run_are_actually_bound(self):
        for key,value in [('scope','ORIGINAL_FREE_SYNTHETIC_3_PROFILE_CONNECTION_QUALIFICATION_ONLY'),
                          ('status','PASS'),('runId','654321')]:
            with self.subTest(key=key),self.assertRaises(AssertionError):
                P.prepare({**self.report,key:value},self.env)

    def test_partial_progress_survives_safe_check_and_first_failure_notice(self):
        progress={'requestedProfiles':500,'lastConfirmedWorkloadProgress':{
            'schema':'helmut-synthetic500-resource-diagnostic/1','nonce':'12345678-1234-4123-8123-123456789abc',
            'requestedProfiles':500,'sequence':25,'phase':'work','operation':'briefing-build',
            'provisionedProfiles':500,'activatedProfiles':500,'activeCohortReadbacks':99,'sourceDocumentsSaved':384,
            'understoodCases':96,'matchingProfiles':1,'decisionProfiles':1,'positiveProfileResults':0,
            'deactivatedProfiles':0,'finalActiveProfiles':'UNKNOWN'},'observedMonotonicNS':123000,
            'sample':20,'meaning':'PARTIAL_PROGRESS_NOT_COMPLETION_PROOF'}
        report={**self.report,'workloadProgress':[progress],'workloadProgressUnknownCounts':[],
            'firstFailure':{'phase':'synthetic500','code':'COMMON_PARENT_REJECTED'},'full500Completed':False}
        value=P.prepare(report,self.env)
        published=json.loads(value['output']['text'].split('```json\n')[1].rsplit('\n```',1)[0])
        self.assertEqual(published['workloadProgress'],[progress])
        notice=P.compact_notice(report)
        self.assertIn('briefing-build',notice);self.assertIn('COMMON_PARENT_REJECTED',notice)
        self.assertIn('"positiveProfileResults":0',notice);self.assertNotIn(self.env['GITHUB_TOKEN'],notice)
        self.assertFalse(published['full500Completed'])

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
