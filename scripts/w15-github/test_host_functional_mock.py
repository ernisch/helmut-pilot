"""Tiny new-End/unchanged-Mock admission and sender seams, no run or originals."""
import sys
sys.dont_write_bytecode = True

import copy
from datetime import datetime, timezone
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch


def load(name):
    spec = importlib.util.spec_from_file_location('host_mock_checks_' + name, Path(__file__).with_name(name + '.py'))
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


T, M, E = (load(n) for n in ('test_host_functional_contract',
    'test_mock500_functional_adapter', 'test_end500_dispatch'))
H = T.H


class HostFunctionalMockChecks(unittest.TestCase):
    def fixture(self):
        helper = M.FunctionalMockAdapters('runTest'); self.addCleanup(helper.doCleanups)
        case = helper.fixture()
        q = T.request(); q.update(exactCommit=case.end['exactCommit'], runId=case.end['runId'])
        q['approval']['exactCommit'] = q['exactCommit']
        case.end = T.accepted(q, T.receipt(q), case.end)
        case.bridge['end500FunctionalContract'] = H.CONTRACT
        helper.rebind(case)
        return helper, case

    def test_new_positive_end_allows_existing_mock_contract_but_never_supplies_mock_go(self):
        helper, case = self.fixture()
        accepted = helper.admit(case)
        self.assertEqual(accepted['memoryProfile'], M.FC.F.MOCK_PROFILE)
        self.assertEqual(case.approval['limits'], M.FC.F.limits('mock500'))
        self.assertEqual(case.approval['limits']['maximumConsumptionBytes'], 4999999488)
        self.assertFalse(accepted['executionAuthority'] or accepted['mock500Acceptance'])
        case.approval['authorized'] = False
        with self.assertRaises(M.F.S.StartRejected): helper.admit(case)

    def test_bad_new_end_or_bridge_is_not_accepted_and_old_functional_end_still_passes(self):
        helper, case = self.fixture(); good = copy.deepcopy(case.end)
        for key, value in (('sameRunFunctionalObservationAccepted', False), ('independentOfOriginalExecution', False),
            ('sharedSafetyAccepted', False), ('providerResourceAccepted', True), ('activeProfiles', 1),
            ('processingCounts', {'authCAS':500,'usageRows':5999,'nativePostimages':3501}),
            ('schema', 'helmut-w15-independent-end500-acceptance/3')):
            case.end = dict(good, **{key:value}); helper.rebind(case)
            with self.subTest(key=key), self.assertRaises(M.F.S.StartRejected): helper.admit(case)
        case.end = good; helper.rebind(case)
        case.bridge.pop('end500FunctionalContract'); helper.rebind(case)
        with self.assertRaisesRegex(M.F.S.StartRejected, 'BRIDGE_REQUIRED'): helper.admit(case)
        old = helper.fixture(); helper.admit(old)

    def test_mock_sender_checks_same_new_acceptance_bridge_and_actual_prior_run(self):
        helper, case = self.fixture(); D = M.D.D
        def pr(record, commit):
            return {'state':'open', 'merged':False, 'head':{'sha':commit},
                'body':'```json\n'+D.canonical(record).decode()+'\n```'}
        bindings = dict(approvedEnd500Commit=case.end['exactCommit'], end500Acceptance=case.end_envelope,
                        compatibilityBridge=case.bridge_envelope)
        run = dict(id=int(case.end['runId']), head_sha=case.end['exactCommit'], head_branch=D.BRANCH,
            event='workflow_dispatch', status='completed', conclusion='success', run_attempt=1, workflow_id=D.WORKFLOW)
        def verify():
            return D.verify_prior(bindings, case.request['exactCommit'], case.request['sourceQualificationSHA256'],
                pr(case.bridge, case.request['exactCommit']), pr(case.end, case.end['exactCommit']),
                api=lambda *_:run, mode=D.FUNCTIONAL)
        verify()
        run['conclusion'] = 'failure'
        with self.assertRaisesRegex(D.DispatchRejected, 'DISPATCH_REJECTED'): verify()

    def test_end_sender_binds_new_contract_before_ready_and_only_one_link_round(self):
        case = E.EndSenderChecks('runTest'); case.setUp(); self.addCleanup(case.doCleanups)
        case.clock.value = T.NOW
        q, go = case.request, case.go
        q['limits'] = dict(T.D.CAP.HOST_POLICY)
        approval = q['approval']; approval.pop('restoreAcceptance')
        approval.update(scope=T.D.CAP.HOST_SCOPE, mode=T.D.CAP.HOST_MODE,
            limits=dict(q['limits']), resourceContract=H.CONTRACT,
            restoreFunctionAcceptance={**E.D.PC.FUNCTION_REFERENCE, 'targetCommit':E.TARGET,
                'compatibilityReviewSHA256':'b'*64},
            issuedAt='2026-11-02T09:59:00Z', expiresAt='2026-11-02T11:00:00Z')
        go.update(scope=T.D.CAP.HOST_SCOPE, issuedAt=approval['issuedAt'], expiresAt=approval['expiresAt'])
        old = case.review
        case.review = lambda launcher=False:dict(old(launcher), scope=T.D.CAP.HOST_SCOPE)
        go.update(reviewSHA256=E.digest(case.review()), launcherReviewSHA256=E.digest(case.review(True)),
            requestSHA256=E.digest(q))
        with patch.object(E.D.FUNCTION, 'verify', return_value={'executionAuthority':False}) as baseline:
            result = case.run_case()
        self.assertTrue(result['dispatchAccepted'], result)
        self.assertEqual(sum(row[0]=='LINKS' for row in case.events), 1)
        self.assertLess(next(i for i,row in enumerate(case.events) if row[0]=='READY'),
                        next(i for i,row in enumerate(case.events) if row[0]=='LINKS'))
        self.assertEqual(len(case.api.posts), 1)
        self.assertEqual(result['mode'], T.D.CAP.HOST_MODE)
        baseline.assert_called_once()


if __name__ == '__main__': unittest.main()
