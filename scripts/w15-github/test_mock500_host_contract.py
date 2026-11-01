"""Six small fictional contract/receipt cases; no host, database or 500er run."""
import sys
sys.dont_write_bytecode = True

import copy
from datetime import datetime, timezone
import importlib.util
from pathlib import Path
import unittest

HERE = Path(__file__).parent


def load(name):
    spec = importlib.util.spec_from_file_location('mock_host_checks_' + name, HERE/(name+'.py'))
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


H, D = load('mock500_host_contract'), load('test_dynamic_host_capacity')
NOW = datetime(2026, 11, 2, 10, tzinfo=timezone.utc)


def request():
    q = D.request(); q.update(mode=H.MODE, limits=H.limits(), maximumWallSeconds=12600)
    q['bindings'] = {'end500Acceptance': {'raw':'FICTIONAL', 'sha256':'e'*64},
        'compatibilityBridge': {'raw':'FICTIONAL', 'sha256':'b'*64},
        'inputBindingSHA256':'d'*64, 'additionalAssetBytes':217563454,
        'approvedEnd500Commit':'a'*40}
    q['approval'] = dict(schema='helmut-w15-mock500-start-approval/1', scope=H.SCOPE,
        resourceContract=H.CONTRACT, authorized=True,
        **{k:q[k] for k in ('mode','exactCommit','branch','runAttempt','nonce','limits')},
        sourceQualificationSHA256=q['sourceQualification']['sha256'],
        end500AcceptanceSHA256='e'*64, compatibilitySHA256='b'*64,
        processingSeconds=10800, completionSeconds=12600, expectedProfiles=500,
        expectedUnits=500, expectedPositions=1500, expectedControls=8000,
        maxProviderCalls=0, maxStorageUSD='0.05', maxReceiveAttempts=1,
        issuedAt='2026-11-02T09:59:00Z', expiresAt='2026-11-02T11:00:00Z')
    return q


def receipt(q):
    sample = D.sample(D.admission()); sample['hostCapacitySafetyObserved'] = True
    budget = D.CAP.host_budget(D.admission())
    component = dict(schema=H.RESOURCE_OBSERVATION_SCHEMA, resourceContract=H.CONTRACT,
        memoryProfile=H.PROFILE, sampleCount=2, firstKernel='UNKNOWN', lastKernel='UNKNOWN',
        components='UNKNOWN', componentPSSMaxima='UNKNOWN', applicationWithTestDriverCombined=True,
        hostCapacityBudget=budget, **dict.fromkeys(('snapshotAtomic','peakCompositionKnown',
            'fileCacheAdditiveToPSS','differentTimeMaximaAdditive','providerResourceAccepted',
            'fullLifetimeClosureAccepted','executionAuthority'),False))
    proof = dict(H.COUNTS, schema='helmut-w15-mock500-functional-results/1',
        categories=dict.fromkeys(('missing','empty','duplicate','technicallyInvalid','unusable'),0),
        maximumTimingsMs={'auth':1,'cas':2,'unit':3,'provider':4}, timingsComplete=True,
        timeLimitsObserved=True, executionAuthority=False, mock500Acceptance=False, productionAcceptance=False)
    worker = dict(status=H.WORKER_STATUS, **{k:q[k] for k in ('mode','exactCommit','runId','runAttempt')},
        functionalContract=H.CONTRACT,functionalSafetyChecksCompleted=True,
        syntheticQualification=False, originalTransferPerformed=True, backupRoundtripVerified=True,
        profiles=500,activeProfiles=0,units=500,providerPhases=1000,results=1500,controls=8000,
        functionalResults=proof,functionalResourceObservation=component,
        **dict.fromkeys(('legacyRegularMemoryAccepted','providerResourceAccepted','executionAuthority',
            'mock500Acceptance','end500Acceptance'),False))
    return dict(status=H.OUTER_STATUS, **{k:q[k] for k in ('mode','exactCommit','runId','runAttempt','nonce')},
        functionalContract=H.CONTRACT,functionalSafetyChecksCompleted=True,
        **dict.fromkeys(('legacyRegularMemoryAccepted','providerResourceAccepted','commonLifetimeMemoryAccepted',
            'mock500Acceptance','end500Acceptance','executionAuthority','retryAllowed'),False),
        sameKernelParentIdentity=True,ownedChildrenExited=True,workerRoles={'workerExited':True},
        hostCapacityBudget=budget,hostCapacityAdmission=D.CAP.host_public_admission(D.admission()),
        initialCommonParent=copy.deepcopy(sample),finalCommonParentAfterOwnedExits=copy.deepcopy(sample),
        workerResult=worker)


def inputs(q):
    return dict(expected_commit=q['exactCommit'],w15_mode=q['mode'],
        w15_request=H.canonical({k:q[k] for k in H.load('mock500_workflow').DECLARATION_KEYS}).decode())


def job(q):
    return dict(id=7654321,run_id=int(q['runId']),head_sha=q['exactCommit'],run_attempt=1,
        status='completed',conclusion='success',started_at='2026-11-02T10:00:00Z',
        completed_at='2026-11-02T12:00:00Z')


def run(q):
    return dict(id=int(q['runId']),head_sha=q['exactCommit'],head_branch=q['branch'].split('refs/heads/')[1],
        event='workflow_dispatch',workflow_id=313506164,run_attempt=1,status='completed',conclusion='success')


def accepted(q,result):
    observed=H.observe_receipt(result,q);result['hostFunctionalObservation']=observed
    return dict(schema=H.ACCEPTANCE_SCHEMA,status=H.ACCEPTANCE_STATUS,scope=H.SCOPE,
        resourceContract=H.CONTRACT,memoryProfile=H.PROFILE,
        **{k:q[k] for k in ('exactCommit','runId','runAttempt','nonce')},
        processingCounts=dict(H.COUNTS),profiles=500,activeProfiles=0,
        receiptSHA256=H.digest(result),requestSHA256=H.digest(q),
        sameRunFunctionalObservationSHA256=H.digest(observed),
        sourceQualificationSHA256=q['sourceQualification']['sha256'],
        end500AcceptanceSHA256=q['bindings']['end500Acceptance']['sha256'],
        actualWorkflowInputsSHA256=H.digest(inputs(q)),jobId=job(q)['id'],observedJobWallSeconds=7200,
        resourceObservation=observed['resourceObservation'],sameRunFunctionalObservationAccepted=True,
        sharedSafetyAccepted=True,mock500FunctionAccepted=True,independentOfOriginalExecution=True,
        remainingCriticalOrHighFindings=0,applicationProviderCapacity='UNKNOWN',databaseProviderCapacity='UNKNOWN',
        **dict.fromkeys(H.TRUE_FIELDS,True),**dict.fromkeys(H.FALSE_FIELDS,False))


class MockHostContractChecks(unittest.TestCase):
    def test_own_explicit_approval_and_original_day_window(self):
        q=request();H.validate_start(q,NOW)
        self.assertEqual(H.limits(),D.CAP.HOST_POLICY)
        for change in ({'resourceContract':'helmut-w15-isolated-functional/1'}, {'authorized':False},
                       {'maxReceiveAttempts':2},{'maxProviderCalls':1},{'expiresAt':'2026-11-02T09:59:01Z'}):
            bad=copy.deepcopy(q);bad['approval'].update(change)
            with self.subTest(change=change),self.assertRaises(ValueError):H.validate_start(bad,NOW)
        bad=copy.deepcopy(q);bad['mode']='mock500-full-functional-gated'
        with self.assertRaises(ValueError):H.validate_start(bad,NOW)
        for now in (datetime(2026,11,2,21,tzinfo=timezone.utc),datetime(2026,11,8,10,tzinfo=timezone.utc)):
            bad=copy.deepcopy(q);bad['approval'].update(issuedAt=now.strftime('%Y-%m-%dT%H:%M:%SZ'),expiresAt=now.replace(hour=22 if now.hour==21 else 11).strftime('%Y-%m-%dT%H:%M:%SZ'))
            with self.assertRaises(ValueError):H.validate_start(bad,now)

    def test_actual_dynamic_guard_not_five_gb_and_all_hard_events_fail(self):
        a=D.admission();sample=D.sample(a);sample['hostCapacitySafetyObserved']=True
        H.assess(sample,a);summary=H.reference_summary(sample)
        self.assertTrue(summary['historicalFiveGBExceeded']);self.assertEqual(summary['providerCapacity'],'UNKNOWN')
        self.assertEqual(D.CAP.HARD_LIMIT,4999999488)
        for key,val in (('configuredLimit','4999999488'),('swapCurrentBytes',1),('kernelLifetimePeakBytes',8*1024**3)):
            bad=copy.deepcopy(sample);bad[key]=val
            with self.subTest(key=key),self.assertRaises(ValueError):H.assess(bad,a)
        for event in ('max','oom','oom_kill','oom_group_kill'):
            bad=copy.deepcopy(sample);bad['events'][event]=1
            with self.subTest(event=event),self.assertRaises(ValueError):H.assess(bad,a)

    def test_complete_function_counts_timings_backup_and_stop_required(self):
        q=request();good=receipt(q);out=H.observe_receipt(good,q)
        self.assertEqual(out['processingCounts'],H.COUNTS);self.assertFalse(out['mock500FunctionAccepted'])
        self.assertTrue(all(out[k]is False for k in H.FALSE_FIELDS))
        for key in H.COUNTS:
            bad=copy.deepcopy(good);bad['workerResult']['functionalResults'][key]+=1
            with self.subTest(key=key),self.assertRaises(Exception):H.observe_receipt(bad,q)
        for target,key,val in (('workerResult','backupRoundtripVerified',False),
            ('workerResult','functionalSafetyChecksCompleted',False),(None,'ownedChildrenExited',False),
            (None,'nonce','ffffffff-ffff-4fff-8fff-ffffffffffff')):
            bad=copy.deepcopy(good);(bad[target]if target else bad)[key]=val
            with self.subTest(key=key),self.assertRaises(ValueError):H.observe_receipt(bad,q)
        bad=copy.deepcopy(good);bad['workerResult']['functionalResults'].update(
            maximumTimingsMs={'auth':'UNKNOWN','cas':1,'unit':2,'provider':3},timingsComplete=False,timeLimitsObserved='UNKNOWN')
        with self.assertRaises(ValueError):H.observe_receipt(bad,q)

    def test_fixed_admission_peak_lifetime_budget_and_no_false_component_precision(self):
        q=request();good=receipt(q)
        self.assertEqual(H.observe_receipt(good,q)['resourceObservation']['memoryProfile'],H.PROFILE)
        for mutate in (
            lambda r:r['hostCapacityAdmission'].update(diagnosticHardLimitBytes=4999999488),
            lambda r:r['finalCommonParentAfterOwnedExits'].update(hostCapacitySafetyObserved=False),
            lambda r:r['finalCommonParentAfterOwnedExits'].update(kernelLifetimePeakBytes=0),
            lambda r:r['initialCommonParent']['hostCapacityObservation'].update(hostAvailableBytes=1),
            lambda r:r['workerResult']['functionalResourceObservation'].update(peakCompositionKnown=True),
            lambda r:r['workerResult']['functionalResourceObservation']['hostCapacityBudget'].update(hardLimitBytes=4999999488)):
            bad=copy.deepcopy(good);mutate(bad)
            with self.assertRaises(ValueError):H.observe_receipt(bad,q)

    def test_independent_actual_run_job_inputs_and_no_old_contract_relabelling(self):
        q=request();result=receipt(q);record=accepted(q,result)
        H.validate_independent_acceptance(record,result,q,run(q),job=job(q),actual_inputs=inputs(q))
        old=copy.deepcopy(q);old['approval']['resourceContract']='helmut-w15-isolated-functional/1'
        forged=dict(record,actualWorkflowInputsSHA256=H.digest(inputs(old)))
        with self.assertRaises(ValueError):H.validate_independent_acceptance(forged,result,q,run(q),job=job(q),actual_inputs=inputs(old))
        for change in ({'run_id':999999},{'head_sha':'f'*40},{'run_attempt':2},{'conclusion':'failure'},
                       {'completed_at':'2026-11-02T13:30:01Z'}):
            with self.subTest(change=change),self.assertRaises(ValueError):
                H.validate_independent_acceptance(record,result,q,run(q),job=dict(job(q),**change),actual_inputs=inputs(q))
        with self.assertRaises(ValueError):H.validate_independent_acceptance(record,result,q,dict(run(q),id=999999),job=job(q),actual_inputs=inputs(q))

    def test_record_hashes_closed_contract_and_no_provider_or_historical_pass(self):
        q=request();result=receipt(q);record=accepted(q,result)
        self.assertEqual(H.observe_receipt(result,q),result['hostFunctionalObservation'])
        for key,val in (('receiptSHA256','f'*64),('end500AcceptanceSHA256','f'*64),
                        ('requestSHA256','f'*64),('providerResourceAccepted',True),('mock500Acceptance',True)):
            bad=dict(record,**{key:val})
            with self.subTest(key=key),self.assertRaises(ValueError):
                H.validate_independent_acceptance(bad,result,q,run(q),job=job(q),actual_inputs=inputs(q))
        bad=copy.deepcopy(result);bad.pop('hostFunctionalObservation')
        with self.assertRaises(ValueError):H.validate_independent_acceptance(record,bad,q,run(q),job=job(q),actual_inputs=inputs(q))


if __name__=='__main__':unittest.main()
