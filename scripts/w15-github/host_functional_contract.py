"""Explicit functional acceptance over the existing dynamic-host execution path.

The transport/worker receipt remains a diagnostic receipt. Only a fresh request
that names this contract can produce the new same-run functional observation;
an independent acceptance of that observation is still required by Mock500.
No execution, resource mutation, prior-receipt promotion or provider acceptance.
"""
import sys
sys.dont_write_bytecode = True

import hashlib
import importlib.util
import json
from functools import lru_cache
from pathlib import Path
import re
import uuid

CONTRACT = 'helmut-w15-end500-host-functional/1'
SCOPE = 'ISOLATED_GITHUB_END500_HOST_FUNCTIONAL_ONLY'
OBSERVATION_SCHEMA = 'helmut-w15-end500-host-functional-observation/1'
OBSERVATION_STATUS = 'PASS_SAME_RUN_END500_FUNCTION_ONLY_INDEPENDENT_ACCEPTANCE_PENDING'
ACCEPTANCE_SCHEMA = 'helmut-w15-independent-end500-acceptance/4'
ACCEPTANCE_STATUS = 'PASS_INDEPENDENT_GITHUB_END500_HOST_FUNCTIONAL_ACCEPTANCE'
SHA = re.compile('[a-f0-9]{64}\\Z')
COUNTS = {'authCAS': 500, 'usageRows': 6000, 'nativePostimages': 3501}
TRUE_FIELDS = ('functionalSafetyAccepted', 'backupSafetyAccepted',
    'independentRestoreFunctionAccepted', 'completeBackupAccepted',
    'completeProcessingAccepted', 'ownedProcessesStopped',
    'authenticatedRemoteReadback', 'secondRestoreIntegrityAccepted')
FALSE_FIELDS = ('processingMemoryAccepted', 'commonLifetimeMemoryAccepted',
    'legacyRegularMemoryAccepted', 'providerResourceAccepted',
    'productionAcceptance', 'mock500Acceptance', 'executionAuthority')


def need(value):
    if not value:
        raise ValueError('END500_HOST_FUNCTIONAL_CONTRACT_REJECTED')


@lru_cache(maxsize=5)
def load(name):
    spec = importlib.util.spec_from_file_location('host_functional_' + name,
        Path(__file__).with_name(name + '.py'))
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'),
        ensure_ascii=True, allow_nan=False).encode('ascii')


def digest(value):
    return hashlib.sha256(canonical(value)).hexdigest()


def selected(request):
    return (type(request) is dict and request.get('mode') == load('restore_capacity').HOST_MODE
            and type(request.get('approval')) is dict
            and request['approval'].get('resourceContract') == CONTRACT)


def validate_start(request, now):
    """Additional explicit contract binding; existing admission gates still run."""
    cap = load('restore_capacity')
    need(selected(request) and request.get('limits') == cap.HOST_POLICY
         and all(type(v) is int for v in request['limits'].values())
         and type(request.get('maximumWallSeconds')) is int
         and request['maximumWallSeconds'] == 3600
         and request['approval'].get('authorized') is True
         and all(request['approval'].get(k) == request[k]
                 for k in ('mode', 'exactCommit', 'branch', 'runAttempt', 'nonce', 'limits', 'maximumWallSeconds'))
         and request['approval'].get('sourceQualificationSHA256') == request['sourceQualification']['sha256']
         and request['approval'].get('maxStorageUSD') == '0.05'
         and type(request['approval'].get('maxProviderCalls')) is int
         and request['approval']['maxProviderCalls'] == 0)
    load('functional_contract').validate_window('end500', now)


def _admission(value, budget):
    cap = load('restore_capacity')
    need(type(value) is dict and value.get('schema') == cap.HOST_ADMISSION_SCHEMA
         and value.get('profile') == cap.HOST_PROFILE and value.get('kernelPageBytes') == 4096
         and value.get('hierarchyRootProven') is True and value.get('originalCallerConstraintsRetained') is True
         and value.get('parentPlacement') == 'DIRECT_HIERARCHY_ROOT'
         and value.get('executionAuthority') is False
         and type(value.get('minimumUnallocatedHostReserveBytes')) is int
         and value['minimumUnallocatedHostReserveBytes'] == cap.HOST_RESERVE
         and all(cap.number(value.get(k)) for k in ('hostTotalBytes', 'hostAvailableBytes',
             'effectiveAvailableBytes', 'diagnosticHardLimitBytes', 'observedMonotonicNS'))
         and 0 < value['hostAvailableBytes'] <= value['hostTotalBytes']
         and value['diagnosticHardLimitBytes'] == budget['hardLimitBytes'])
    rows = value.get('ancestorLimits')
    need(type(rows) is list and 1 <= len(rows) <= 64)
    finite = []
    for row in rows:
        need(type(row) is dict and set(row) == {'maximumBytes', 'currentBytes', 'headroomBytes'})
        if row['maximumBytes'] == 'UNLIMITED_ROOT':
            need(row == {'maximumBytes':'UNLIMITED_ROOT', 'currentBytes':'NOT_APPLICABLE', 'headroomBytes':'UNLIMITED_ROOT'})
        elif row['maximumBytes'] == 'UNLIMITED':
            need(cap.number(row['currentBytes']) and row['headroomBytes'] == 'UNLIMITED')
        else:
            need(all(cap.number(row[k]) for k in row)
                 and row['headroomBytes'] == row['maximumBytes']-row['currentBytes'])
            finite.append(row['headroomBytes'])
    need(rows[-1]['maximumBytes'] == 'UNLIMITED_ROOT'
         and value['effectiveAvailableBytes'] == min([value['hostAvailableBytes'], *finite])
         and value['diagnosticHardLimitBytes'] == ((value['effectiveAvailableBytes']-cap.HOST_RESERVE)//4096)*4096)


def _sample(sample, budget):
    cap = load('restore_capacity')
    need(type(sample) is dict and sample.get('configuredLimit') == str(budget['hardLimitBytes'])
         and sample.get('hostCapacityBudget') == budget
         and sample.get('hostCapacitySafetyObserved') is True
         and sample.get('swapMaximum') == '0' and type(sample.get('swapCurrentBytes')) is int
         and sample['swapCurrentBytes'] == 0
         and all(cap.number(sample.get(k)) and sample[k] <= budget['hardLimitBytes']
                 for k in ('kernelLifetimePeakBytes', 'currentBytes'))
         and type(sample.get('events')) is dict
         and all(type(sample['events'].get(k)) is int and sample['events'][k] == 0
                 for k in ('max', 'oom', 'oom_kill', 'oom_group_kill')))
    obs = cap.host_closed_observation(sample.get('hostCapacityObservation'))
    need(obs is not None and obs['status'] == 'PASS' and obs['ancestorIdentitiesMatch'] is True
         and cap.number(obs['hostAvailableBytes']) and obs['hostAvailableBytes'] >= cap.HOST_RESERVE
         and obs['requiredAncestorHeadroomBytes'] == budget['hardLimitBytes'] + cap.HOST_RESERVE
         and (obs['minimumAncestorHeadroomBytes'] == 'UNLIMITED'
              or type(obs['minimumAncestorHeadroomBytes']) is int
              and obs['minimumAncestorHeadroomBytes'] >= obs['requiredAncestorHeadroomBytes']))


def observe_receipt(receipt, request):
    """Validate this completed lifetime, never synthesize a missing closure."""
    cap, workflow = load('restore_capacity'), load('restore_workflow')
    need(type(receipt) is dict)
    receipt = dict(receipt)
    existing = receipt.pop('hostFunctionalObservation', None)
    need(selected(request) and type(receipt) is dict
         and receipt.get('status') == 'COMPLETED_FULL_END500_HOST_CAPACITY_DIAGNOSTIC_ONLY'
         and all(receipt.get(k) == request[k] for k in ('mode', 'exactCommit', 'runId', 'runAttempt', 'nonce'))
         and receipt.get('diagnosticOnly') is True
         and all(receipt.get(k) is False for k in ('end500Acceptance', 'mock500Acceptance',
             'commonLifetimeMemoryAccepted', 'legacyEnd500Accepted', 'legacyRegularMemoryAccepted',
             'providerResourceAccepted', 'executionAuthority', 'retryAllowed'))
         and receipt.get('sameKernelParentIdentity') is True
         and receipt.get('ownedChildrenExited') is True)
    worker = workflow.validate_public_result(receipt.get('workerResult'))
    need(all(worker[k] == request[k] for k in ('mode', 'exactCommit', 'runId', 'runAttempt')))
    proof = workflow.validate_functional_results(worker['diagnosticResults'])
    budget = receipt.get('hostCapacityBudget')
    trace = load('end500_capacity_trace').closed(receipt.get('end500CapacityTrace'),
        host_capacity_budget=budget)
    need(type(budget) is dict and trace is not None
         and trace['anyCapacitySafetyFailureOrUnknown'] is False)
    # The original privileged bootstrap already checks and binds the complete
    # admission. Its public projection is checked here without accepting any
    # caller-supplied capacity or silently falling back to the old fixed cap.
    admission = receipt.get('hostCapacityAdmission')
    _admission(admission, budget)
    initial, final = receipt.get('initialCommonParent'), receipt.get('finalCommonParentAfterOwnedExits')
    for sample in (initial, final):
        _sample(sample, budget)
    need(final['kernelLifetimePeakBytes'] >= initial['kernelLifetimePeakBytes']
         and final['kernelLifetimePeakBytes'] >= trace['kernelLifetimePeakBytes'])
    observed = {'schema': OBSERVATION_SCHEMA, 'status': OBSERVATION_STATUS,
        'resourceContract': CONTRACT, 'scope': SCOPE,
        **{k: request[k] for k in ('exactCommit', 'runId', 'runAttempt', 'nonce')},
        'requestSHA256': digest(request), 'receiptSHA256': digest(receipt),
        'sourceQualificationSHA256': request['sourceQualification']['sha256'],
        'processingCounts': {k: proof[k] for k in COUNTS}, 'profiles': 500, 'activeProfiles': 0,
        'functionalResults': proof, 'sharedSafetyAccepted': True,
        'resourceObservation': {'memoryProfile': cap.HOST_PROFILE,
            'comparisonScope': 'COMMON_PARENT_LIFETIME_ALL_PHASES',
            'hardLimitBytes': budget['hardLimitBytes'],
            'minimumHostReserveBytes': cap.HOST_RESERVE,
            'kernelLifetimePeakBytes': final['kernelLifetimePeakBytes'],
            'historicalFiveGBReferenceBytes': cap.HARD_LIMIT,
            'historicalFiveGBExceeded': final['kernelLifetimePeakBytes'] > cap.HARD_LIMIT,
            'historicalProcessingPeakBytes': cap.LEGACY_PEAK,
            'historicalProcessingPeakExceeded': final['kernelLifetimePeakBytes'] > cap.LEGACY_PEAK,
            'providerCapacity': 'UNKNOWN'},
        'independentAcceptanceCompleted': False,
        **dict.fromkeys(FALSE_FIELDS, False)}
    if existing is not None:
        need(existing == observed)
    return observed


def validate_acceptance(record):
    """A distinct independently reviewed record, not a worker/diagnostic PASS."""
    cap = load('restore_capacity')
    need(type(record) is dict and record.get('schema') == ACCEPTANCE_SCHEMA
         and record.get('status') == ACCEPTANCE_STATUS and record.get('scope') == SCOPE
         and record.get('resourceContract') == CONTRACT and record.get('memoryProfile') == cap.HOST_PROFILE
         and record.get('processingCounts') == COUNTS
         and all(type(v) is int for v in record['processingCounts'].values())
         and all(record.get(k) is True for k in TRUE_FIELDS)
         and all(record.get(k) is False for k in FALSE_FIELDS)
         and record.get('independentOfOriginalExecution') is True
         and type(record.get('remainingCriticalOrHighFindings')) is int
         and record['remainingCriticalOrHighFindings'] == 0
         and record.get('sameRunFunctionalObservationAccepted') is True
         and record.get('sharedSafetyAccepted') is True
         and type(record.get('profiles')) is int and record['profiles'] == 500
         and type(record.get('activeProfiles')) is int and record['activeProfiles'] == 0
         and record.get('applicationProviderCapacity') == 'UNKNOWN'
         and record.get('databaseProviderCapacity') == 'UNKNOWN'
         and all(type(record.get(k)) is str and SHA.fullmatch(record[k])
             for k in ('receiptSHA256', 'requestSHA256', 'sameRunFunctionalObservationSHA256',
                       'sourceQualificationSHA256', 'actualWorkflowInputsSHA256'))
         and type(record.get('jobId')) is int and record['jobId'] > 0
         and type(record.get('observedJobWallSeconds')) is int
         and 0 < record['observedJobWallSeconds'] <= 3600)
    nonce = uuid.UUID(record['nonce'])
    need(str(nonce) == record['nonce'] and nonce.version == 4 and nonce.variant == uuid.RFC_4122)
    observed = record.get('resourceObservation')
    need(type(observed) is dict and set(observed) == {'memoryProfile', 'comparisonScope', 'hardLimitBytes',
        'minimumHostReserveBytes', 'kernelLifetimePeakBytes', 'historicalFiveGBReferenceBytes',
        'historicalFiveGBExceeded', 'historicalProcessingPeakBytes',
        'historicalProcessingPeakExceeded', 'providerCapacity'}
         and observed['memoryProfile'] == cap.HOST_PROFILE
         and observed['comparisonScope'] == 'COMMON_PARENT_LIFETIME_ALL_PHASES'
         and cap.number(observed['hardLimitBytes']) and observed['hardLimitBytes'] > 0
         and observed['hardLimitBytes'] % 4096 == 0
         and type(observed['minimumHostReserveBytes']) is int
         and observed['minimumHostReserveBytes'] == cap.HOST_RESERVE
         and cap.number(observed['kernelLifetimePeakBytes'])
         and observed['kernelLifetimePeakBytes'] <= observed['hardLimitBytes']
         and type(observed['historicalFiveGBReferenceBytes']) is int
         and observed['historicalFiveGBReferenceBytes'] == cap.HARD_LIMIT
         and observed['historicalFiveGBExceeded'] is (observed['kernelLifetimePeakBytes'] > cap.HARD_LIMIT)
         and type(observed['historicalProcessingPeakBytes']) is int
         and observed['historicalProcessingPeakBytes'] == cap.LEGACY_PEAK
         and observed['historicalProcessingPeakExceeded'] is (observed['kernelLifetimePeakBytes'] > cap.LEGACY_PEAK)
         and observed['providerCapacity'] == 'UNKNOWN')
    return record


def validate_independent_acceptance(record, receipt, request, run, *, job, actual_inputs):
    """The caller must obtain run/job/inputs independently via authenticated GitHub.

    Job-log inputs are a bounded public subset, not an operator's reconstructed
    request. Requiring them prevents relabelling an older diagnostic request.
    No network client, credential, log body or cipher input belongs here.
    """
    validate_acceptance(record)
    workflow = load('restore_workflow')
    validate_start(request, workflow._utc(request['approval']['issuedAt']))
    need(type(actual_inputs) is dict and set(actual_inputs) == {'expected_commit', 'w15_mode', 'w15_request'}
         and actual_inputs['expected_commit'] == request['exactCommit']
         and actual_inputs['w15_mode'] == request['mode']
         and type(actual_inputs['w15_request']) is str)
    declaration = workflow._decode(actual_inputs['w15_request'].encode('utf-8'), workflow.MAX_INPUT)
    need(declaration == {k:request[k] for k in workflow.DECLARATION_KEYS}
         and record['actualWorkflowInputsSHA256'] == digest(actual_inputs)
         and type(job) is dict and type(job.get('id')) is int and job['id'] == record['jobId']
         and type(job.get('run_id')) is int and str(job['run_id']) == request['runId']
         and job.get('head_sha') == request['exactCommit']
         and type(job.get('run_attempt')) is int and job['run_attempt'] == 1
         and job.get('status') == 'completed' and job.get('conclusion') == 'success')
    elapsed = (workflow._utc(job['completed_at']) - workflow._utc(job['started_at'])).total_seconds()
    need(0 < elapsed <= 3600 and elapsed == record['observedJobWallSeconds'])
    observed = observe_receipt(receipt, request)
    need(receipt.get('hostFunctionalObservation') == observed
         and record['receiptSHA256'] == digest(receipt)
         and record['sameRunFunctionalObservationSHA256'] == digest(observed)
         and record['requestSHA256'] == digest(request)
         and record['sourceQualificationSHA256'] == observed['sourceQualificationSHA256']
         and all(record.get(k) == observed[k] for k in ('exactCommit', 'runId', 'runAttempt', 'nonce'))
         and record.get('resourceObservation') == observed['resourceObservation']
         and type(run) is dict and str(run.get('id')) == observed['runId']
         and run.get('head_sha') == observed['exactCommit']
         and run.get('head_branch') == 'codex/w15-github-end500-preparation-20261028'
         and run.get('event') == 'workflow_dispatch' and run.get('status') == 'completed'
         and run.get('conclusion') == 'success' and type(run.get('run_attempt')) is int
         and run['run_attempt'] == 1 and run.get('workflow_id') == 313506164)
    return record
