"""Explicit Mock500 function contract over the existing dynamic-host guards.

No host admission, execution, cache/peak mutation or historical PASS promotion
occurs here. A fresh own GO selects this contract; an actual same-run receipt
and independently authenticated GitHub inputs are required for acceptance.
"""
import sys
sys.dont_write_bytecode = True

from functools import lru_cache
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import uuid

MODE = 'mock500-full-host-functional-gated'
SCOPE = 'ISOLATED_GITHUB_MOCK500_HOST_FUNCTIONAL_ONLY'
CONTRACT = PROFILE = 'helmut-w15-mock500-host-functional/1'
OBSERVATION_SCHEMA = 'helmut-w15-mock500-host-functional-observation/1'
OBSERVATION_STATUS = 'PASS_SAME_RUN_MOCK500_FUNCTION_ONLY_INDEPENDENT_ACCEPTANCE_PENDING'
RESOURCE_OBSERVATION_SCHEMA = 'helmut-w15-mock500-host-resource-observation/1'
ACCEPTANCE_SCHEMA = 'helmut-w15-independent-mock500-host-functional-acceptance/1'
ACCEPTANCE_STATUS = 'PASS_INDEPENDENT_GITHUB_MOCK500_HOST_FUNCTIONAL_ACCEPTANCE'
WORKER_STATUS = 'PASS_MOCK500_HOST_FUNCTIONAL_BODY_ONLY_INDEPENDENT_ACCEPTANCE_PENDING'
OUTER_STATUS = 'PASS_FRESH_MOCK500_HOST_FUNCTIONAL_RUNNER_OWNED_LIFETIME_ONLY'
PROCESSING_SECONDS, WALL_SECONDS = 10800, 12600
BRANCH = 'refs/heads/codex/w15-github-end500-preparation-20261028'
SHA, HEX = re.compile('[a-f0-9]{64}\\Z'), re.compile('[a-f0-9]{40}\\Z')
COUNTS = {'simultaneouslyActiveProfiles': 500, 'completedUnits': 500,
    'localProviderPhases': 1000, 'storedResults': 1500, 'auditedPositions': 1500,
    'unitChecksCompleted': 17000, 'securityControls': 8000, 'activeProfiles': 0}
TRUE_FIELDS = ('functionalSafetyAccepted', 'completeProcessingAccepted',
    'completeBackupAccepted', 'authenticatedRemoteReadback',
    'secondRestoreIntegrityAccepted', 'ownedProcessesStopped')
FALSE_FIELDS = ('processingMemoryAccepted', 'commonLifetimeMemoryAccepted',
    'legacyRegularMemoryAccepted', 'providerResourceAccepted',
    'productionAcceptance', 'mock500Acceptance', 'executionAuthority')


@lru_cache(maxsize=8)
def load(name):
    spec = importlib.util.spec_from_file_location('mock_host_contract_' + name,
        Path(__file__).with_name(name + '.py'))
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


LIMITS = dict(load('restore_capacity').HOST_POLICY)


def need(value):
    if not value:
        raise ValueError('MOCK500_HOST_FUNCTIONAL_CONTRACT_REJECTED')


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'),
        ensure_ascii=True, allow_nan=False).encode('ascii')


def digest(value):
    return hashlib.sha256(canonical(value)).hexdigest()


def limits():
    return dict(load('restore_capacity').HOST_POLICY)


def selected(request):
    return (type(request) is dict and request.get('mode') == MODE
            and type(request.get('approval')) is dict
            and request['approval'].get('resourceContract') == CONTRACT)


def validate_start(request, now):
    """Add explicit own authority; existing full admission gates remain required."""
    need(selected(request) and request.get('limits') == limits()
         and all(type(v) is int for v in request['limits'].values())
         and type(request.get('maximumWallSeconds')) is int
         and request['maximumWallSeconds'] == WALL_SECONDS
         and request.get('branch') == BRANCH
         and type(request.get('runAttempt')) is int and request['runAttempt'] == 1
         and type(request.get('exactCommit')) is str and HEX.fullmatch(request['exactCommit'])
         and type(request.get('sourceQualification')) is dict
         and type(request['sourceQualification'].get('sha256')) is str
         and SHA.fullmatch(request['sourceQualification']['sha256']))
    approval = request['approval']
    need(approval.get('schema') == 'helmut-w15-mock500-start-approval/1'
         and approval.get('scope') == SCOPE and approval.get('authorized') is True
         and all(approval.get(k) == request[k]
                 for k in ('mode', 'exactCommit', 'branch', 'runAttempt', 'nonce', 'limits'))
         and type(approval.get('runAttempt')) is int and approval['runAttempt'] == 1
         and all(type(v) is int for v in approval['limits'].values())
         and approval.get('sourceQualificationSHA256') == request['sourceQualification']['sha256']
         and type(request.get('bindings')) is dict
         and all(type(request['bindings'].get(k)) is dict
             and type(request['bindings'][k].get('sha256')) is str
             and SHA.fullmatch(request['bindings'][k]['sha256'])
             for k in ('end500Acceptance', 'compatibilityBridge'))
         and approval.get('end500AcceptanceSHA256') == request['bindings']['end500Acceptance']['sha256']
         and approval.get('compatibilitySHA256') == request['bindings']['compatibilityBridge']['sha256']
         and approval.get('maxStorageUSD') == '0.05'
         and all(type(approval.get(k)) is int and approval[k] == v for k,v in {
             'processingSeconds': PROCESSING_SECONDS, 'completionSeconds': WALL_SECONDS,
             'expectedProfiles': 500, 'expectedUnits': 500, 'expectedPositions': 1500,
             'expectedControls': 8000, 'maxProviderCalls': 0, 'maxReceiveAttempts': 1}.items()))
    nonce = uuid.UUID(request['nonce'])
    need(str(nonce) == request['nonce'] and nonce.version == 4 and nonce.variant == uuid.RFC_4122)
    workflow = load('restore_workflow')
    issued, expires = workflow._utc(approval['issuedAt']), workflow._utc(approval['expiresAt'])
    need(issued <= now < expires and 0 < (expires-issued).total_seconds() <= 7200)
    load('functional_contract').validate_window('mock500', now)


def assess(sample, admission):
    """Reuse the full immutable admission and all actual host/ancestor guards."""
    return load('restore_capacity').host_assess(sample, admission)


def reference_summary(sample):
    """The whole-lifetime old limits are comparisons, never provider budgets."""
    cap, common = load('restore_capacity'), load('common_resources')
    budget = common.closed_host_capacity_budget(sample.get('hostCapacityBudget'))
    need(budget is not None)
    load('host_functional_contract')._sample(sample, budget)
    peak = sample['kernelLifetimePeakBytes']
    legacy = load('mock500_resources').MAXIMUM
    return {'resourceContract': CONTRACT, 'memoryProfile': PROFILE,
        'comparisonScope': 'COMMON_PARENT_LIFETIME_ALL_PHASES',
        'hardLimitBytes': budget['hardLimitBytes'], 'minimumHostReserveBytes': cap.HOST_RESERVE,
        'kernelLifetimePeakBytes': peak,
        'historicalFiveGBReferenceBytes': cap.HARD_LIMIT,
        'historicalFiveGBExceeded': peak > cap.HARD_LIMIT,
        'historicalProcessingPeakBytes': legacy, 'historicalProcessingPeakExceeded': peak > legacy,
        'providerCapacity': 'UNKNOWN'}


def validate_resource_observation(value, budget):
    keys = {'schema', 'resourceContract', 'memoryProfile', 'sampleCount', 'firstKernel', 'lastKernel',
        'components', 'componentPSSMaxima', 'snapshotAtomic', 'peakCompositionKnown',
        'fileCacheAdditiveToPSS', 'differentTimeMaximaAdditive', 'applicationWithTestDriverCombined',
        'providerResourceAccepted', 'fullLifetimeClosureAccepted', 'executionAuthority', 'hostCapacityBudget'}
    need(type(value) is dict and set(value) == keys
         and value['schema'] == RESOURCE_OBSERVATION_SCHEMA and value['resourceContract'] == CONTRACT
         and value['memoryProfile'] == PROFILE and value['hostCapacityBudget'] == budget
         and type(value['sampleCount']) is int and value['sampleCount'] > 0
         and value['applicationWithTestDriverCombined'] is True
         and all(value[k] is False for k in ('snapshotAtomic', 'peakCompositionKnown',
             'fileCacheAdditiveToPSS', 'differentTimeMaximaAdditive', 'providerResourceAccepted',
             'fullLifetimeClosureAccepted', 'executionAuthority')))
    return value


def observe_receipt(receipt, request):
    """Only a complete same-run function and owned lifetime can be observed."""
    need(type(receipt) is dict and selected(request))
    receipt = dict(receipt); existing = receipt.pop('hostFunctionalObservation', None)
    need(receipt.get('status') == OUTER_STATUS
         and all(receipt.get(k) == request[k] for k in ('mode', 'exactCommit', 'runId', 'runAttempt', 'nonce'))
         and receipt.get('functionalContract') == CONTRACT
         and receipt.get('functionalSafetyChecksCompleted') is True
         and all(receipt.get(k) is False for k in ('legacyRegularMemoryAccepted',
             'providerResourceAccepted', 'commonLifetimeMemoryAccepted', 'mock500Acceptance',
             'end500Acceptance', 'executionAuthority', 'retryAllowed'))
         and receipt.get('sameKernelParentIdentity') is True and receipt.get('ownedChildrenExited') is True
         and type(receipt.get('workerRoles')) is dict and receipt['workerRoles'].get('workerExited') is True)
    worker = receipt.get('workerResult')
    need(type(worker) is dict and worker.get('status') == WORKER_STATUS
         and all(worker.get(k) == request[k] for k in ('mode', 'exactCommit', 'runId', 'runAttempt'))
         and worker.get('functionalContract') == CONTRACT and worker.get('functionalSafetyChecksCompleted') is True
         and all(worker.get(k) is v for k,v in {'syntheticQualification': False,
             'originalTransferPerformed': True, 'backupRoundtripVerified': True,
             'legacyRegularMemoryAccepted': False, 'providerResourceAccepted': False,
             'executionAuthority': False, 'mock500Acceptance': False, 'end500Acceptance': False}.items())
         and all(type(worker.get(k)) is int and worker[k] == v for k,v in {
             'profiles': 500, 'activeProfiles': 0, 'units': 500, 'providerPhases': 1000,
             'results': 1500, 'controls': 8000}.items()))
    proof = load('mock500_runner').validate_functional_results(worker['functionalResults'])
    # An incomplete timing observation must never become a full function PASS.
    need(proof['timingsComplete'] is True and proof['timeLimitsObserved'] is True)
    common, helper = load('common_resources'), load('host_functional_contract')
    budget = common.closed_host_capacity_budget(receipt.get('hostCapacityBudget'))
    need(budget is not None)
    helper._admission(receipt.get('hostCapacityAdmission'), budget)
    observation = validate_resource_observation(worker.get('functionalResourceObservation'), budget)
    initial, final = receipt.get('initialCommonParent'), receipt.get('finalCommonParentAfterOwnedExits')
    for sample in (initial, final): helper._sample(sample, budget)
    need(final['kernelLifetimePeakBytes'] >= initial['kernelLifetimePeakBytes'])
    observed = {'schema': OBSERVATION_SCHEMA, 'status': OBSERVATION_STATUS,
        'resourceContract': CONTRACT, 'scope': SCOPE,
        **{k: request[k] for k in ('exactCommit', 'runId', 'runAttempt', 'nonce')},
        'requestSHA256': digest(request), 'receiptSHA256': digest(receipt),
        'sourceQualificationSHA256': request['sourceQualification']['sha256'],
        'end500AcceptanceSHA256': request['bindings']['end500Acceptance']['sha256'],
        'processingCounts': {k: proof[k] for k in COUNTS}, 'profiles': 500, 'activeProfiles': 0,
        'functionalResults': proof, 'sharedSafetyAccepted': True,
        'resourceObservation': reference_summary(final),
        'componentObservationSHA256': digest(observation),
        'independentAcceptanceCompleted': False, 'mock500FunctionAccepted': False,
        **dict.fromkeys(FALSE_FIELDS, False)}
    if existing is not None: need(existing == observed)
    return observed


def validate_acceptance(record):
    cap = load('restore_capacity')
    need(type(record) is dict and record.get('schema') == ACCEPTANCE_SCHEMA
         and record.get('status') == ACCEPTANCE_STATUS and record.get('scope') == SCOPE
         and record.get('resourceContract') == record.get('memoryProfile') == CONTRACT
         and record.get('processingCounts') == COUNTS
         and all(type(v) is int for v in record['processingCounts'].values())
         and all(record.get(k) is True for k in TRUE_FIELDS)
         and all(record.get(k) is False for k in FALSE_FIELDS)
         and record.get('mock500FunctionAccepted') is True
         and type(record.get('exactCommit')) is str and HEX.fullmatch(record['exactCommit'])
         and type(record.get('runId')) is str and re.fullmatch('[1-9][0-9]{4,19}', record['runId'])
         and type(record.get('runAttempt')) is int and record['runAttempt'] == 1
         and record.get('independentOfOriginalExecution') is True
         and type(record.get('remainingCriticalOrHighFindings')) is int
         and record['remainingCriticalOrHighFindings'] == 0
         and record.get('sameRunFunctionalObservationAccepted') is True and record.get('sharedSafetyAccepted') is True
         and type(record.get('profiles')) is int and record['profiles'] == 500
         and type(record.get('activeProfiles')) is int and record['activeProfiles'] == 0
         and record.get('applicationProviderCapacity') == record.get('databaseProviderCapacity') == 'UNKNOWN'
         and all(type(record.get(k)) is str and SHA.fullmatch(record[k]) for k in (
             'receiptSHA256', 'requestSHA256', 'sameRunFunctionalObservationSHA256',
             'sourceQualificationSHA256', 'end500AcceptanceSHA256', 'actualWorkflowInputsSHA256'))
         and type(record.get('jobId')) is int and record['jobId'] > 0
         and type(record.get('observedJobWallSeconds')) is int and 0 < record['observedJobWallSeconds'] <= WALL_SECONDS)
    nonce = uuid.UUID(record['nonce'])
    need(str(nonce) == record['nonce'] and nonce.version == 4 and nonce.variant == uuid.RFC_4122)
    observed = record.get('resourceObservation')
    need(type(observed) is dict and set(observed) == {'resourceContract', 'memoryProfile', 'comparisonScope',
        'hardLimitBytes', 'minimumHostReserveBytes', 'kernelLifetimePeakBytes', 'historicalFiveGBReferenceBytes',
        'historicalFiveGBExceeded', 'historicalProcessingPeakBytes', 'historicalProcessingPeakExceeded', 'providerCapacity'}
         and observed['resourceContract'] == observed['memoryProfile'] == CONTRACT
         and observed['comparisonScope'] == 'COMMON_PARENT_LIFETIME_ALL_PHASES'
         and cap.number(observed['hardLimitBytes']) and observed['hardLimitBytes'] > 0 and observed['hardLimitBytes'] % 4096 == 0
         and type(observed['minimumHostReserveBytes']) is int and observed['minimumHostReserveBytes'] == cap.HOST_RESERVE
         and cap.number(observed['kernelLifetimePeakBytes']) and observed['kernelLifetimePeakBytes'] <= observed['hardLimitBytes']
         and type(observed['historicalFiveGBReferenceBytes']) is int and observed['historicalFiveGBReferenceBytes'] == cap.HARD_LIMIT
         and observed['historicalFiveGBExceeded'] is (observed['kernelLifetimePeakBytes'] > cap.HARD_LIMIT)
         and type(observed['historicalProcessingPeakBytes']) is int and observed['historicalProcessingPeakBytes'] == load('mock500_resources').MAXIMUM
         and observed['historicalProcessingPeakExceeded'] is (observed['kernelLifetimePeakBytes'] > observed['historicalProcessingPeakBytes'])
         and observed['providerCapacity'] == 'UNKNOWN')
    return record


def validate_independent_acceptance(record, receipt, request, run, *, job, actual_inputs):
    """Run, job and three public inputs must be independently authenticated."""
    validate_acceptance(record)
    workflow, date_parser = load('mock500_workflow'), load('restore_workflow')
    validate_start(request, date_parser._utc(request['approval']['issuedAt']))
    need(type(actual_inputs) is dict and set(actual_inputs) == {'expected_commit', 'w15_mode', 'w15_request'}
         and actual_inputs['expected_commit'] == request['exactCommit'] and actual_inputs['w15_mode'] == MODE
         and type(actual_inputs['w15_request']) is str)
    declaration = workflow.decode(actual_inputs['w15_request'].encode('utf-8'), workflow.MAX_INPUT)
    need(declaration == {k: request[k] for k in workflow.DECLARATION_KEYS}
         and record['actualWorkflowInputsSHA256'] == digest(actual_inputs)
         and type(job) is dict and type(job.get('id')) is int and job['id'] == record['jobId']
         and type(job.get('run_id')) is int and str(job['run_id']) == request['runId']
         and job.get('head_sha') == request['exactCommit'] and type(job.get('run_attempt')) is int and job['run_attempt'] == 1
         and job.get('status') == 'completed' and job.get('conclusion') == 'success')
    elapsed = (date_parser._utc(job['completed_at'])-date_parser._utc(job['started_at'])).total_seconds()
    need(0 < elapsed <= WALL_SECONDS and elapsed == record['observedJobWallSeconds'])
    observed = observe_receipt(receipt, request)
    need(receipt.get('hostFunctionalObservation') == observed
         and record['receiptSHA256'] == digest(receipt) and record['requestSHA256'] == digest(request)
         and record['sameRunFunctionalObservationSHA256'] == digest(observed)
         and record['sourceQualificationSHA256'] == observed['sourceQualificationSHA256']
         and record['end500AcceptanceSHA256'] == observed['end500AcceptanceSHA256']
         and all(record.get(k) == observed[k] for k in ('exactCommit', 'runId', 'runAttempt', 'nonce'))
         and record.get('resourceObservation') == observed['resourceObservation']
         and type(run) is dict and type(run.get('id')) is int and str(run['id']) == observed['runId']
         and run.get('head_sha') == observed['exactCommit'] and run.get('head_branch') == BRANCH.removeprefix('refs/heads/')
         and run.get('event') == 'workflow_dispatch' and run.get('status') == 'completed' and run.get('conclusion') == 'success'
         and type(run.get('run_attempt')) is int and run['run_attempt'] == 1 and run.get('workflow_id') == 313506164)
    return record
