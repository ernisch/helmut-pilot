"""Closed validators for the approved one-way processing/backup contract.

No runtime resource, original, network or permission operations occur here. The
existing privileged supervisor must establish the genuine boundary, observe the
same kernel parent and perform its single fixed-limit write before making an
ACK. A self-declared dictionary is never authority to perform that operation.
"""
import sys
sys.dont_write_bytecode = True

import importlib.util
from functools import lru_cache
import json
from pathlib import Path
import re
import uuid

CONTRACT = 'helmut-w15-processing-backup-phases/1'
END_MODE = 'end500-full-phased-gated'
MOCK_MODE = 'mock500-full-phased-gated'
END_PROFILE = 'helmut-w15-end500-processing-backup/4'
MOCK_PROFILE = 'helmut-w15-mock500-processing-backup/3'
SCOPES = {END_MODE: 'ISOLATED_GITHUB_END500_PHASED_ONLY',
          MOCK_MODE: 'ISOLATED_GITHUB_MOCK500_PHASED_ONLY'}
HARD_LIMIT = 4999999488
HOST_RESERVE = 2147483648
BOUNDARY_SCHEMA = 'helmut-w15-processing-backup-boundary/1'
ACK_SCHEMA = 'helmut-w15-processing-backup-transition/1'
CLOSURE_SCHEMA = 'helmut-w15-processing-backup-closure/1'
MAX_ENCODED = 196608
FALSE_FLAGS = {'legacyRestoreAccepted', 'commonLifetimeMemoryAccepted',
               'end500Acceptance', 'mock500Acceptance', 'executionAuthority'}
EVENTS = {'low', 'high', 'max', 'oom', 'oom_kill', 'oom_group_kill', 'sock_throttled'}
REQUIRED_EVENTS = {'max', 'oom', 'oom_kill', 'oom_group_kill'}
LIMITS = {
    'end500': {'comparisonBudgetBytes': 2560000000, 'maximumConsumptionBytes': 2048000000,
               'requiredReserveBytes': 512000000, 'swapBytes': 0},
    'mock500': {'comparisonBudgetBytes': 2048000000, 'maximumConsumptionBytes': 1638400000,
                'requiredReserveBytes': 409600000, 'swapBytes': 0},
}
COUNTS = {'end500': {'authCAS': 500, 'usageRows': 6000, 'nativePostimages': 3501},
          'mock500': {'simultaneouslyActiveProfiles': 500, 'units': 500,
                      'providerPhases': 1000, 'storedResults': 1500, 'controls': 8000}}
FUNCTION_REFERENCE = {
    'schema': 'helmut-w15-restore-function-reference/1',
    'runId': '41132913871',
    'exactCommit': '2c889a25cf04acc13600f2ce5b3882ddfb6c1fe1',
    'receiptSHA256': '5e6e9ef88b2c610c8d5434694a7e300b1c012eb4bf43af84e63d8f2181fe8864',
    'independentReviewSHA256': 'bab65e2b7efe1c509805ecdf4ffc75f50f80e971f9aeb81228ab72a182bde656',
    'legacyRestoreAccepted': False,
}


class PhaseRejected(ValueError):
    def __init__(self):
        super().__init__('PROCESSING_BACKUP_PHASE_CONTRACT_REJECTED')


def need(value):
    if not value:
        raise PhaseRejected()


def number(value):
    return type(value) is int and 0 <= value <= 2**53 - 1


def clone(value):
    try:
        raw = json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False)
        need(len(raw) <= MAX_ENCODED)
        return json.loads(raw)
    except (TypeError, ValueError, OverflowError, RecursionError):
        raise PhaseRejected() from None


@lru_cache(maxsize=1)
def capacity():
    spec = importlib.util.spec_from_file_location('w15_phase_capacity', Path(__file__).with_name('restore_capacity.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def stage(mode):
    return {END_MODE: 'end500', MOCK_MODE: 'mock500'}.get(mode) if type(mode) is str else None


def _stage(value):
    need(type(value) is str and value in LIMITS)
    return value


def profile(stage):
    return {'end500': END_PROFILE, 'mock500': MOCK_PROFILE}[_stage(stage)]


def processing_limits(stage):
    return dict(LIMITS[_stage(stage)])


def expected_counts(stage):
    return dict(COUNTS[_stage(stage)])


def context(value):
    keys = {'exactCommit', 'runId', 'runAttempt', 'nonce'}
    need(type(value) is dict and set(value) == keys
         and type(value['exactCommit']) is str and re.fullmatch('[a-f0-9]{40}', value['exactCommit'])
         and type(value['runId']) is str and re.fullmatch('[1-9][0-9]{4,19}', value['runId'])
         and type(value['runAttempt']) is int and value['runAttempt'] == 1
         and type(value['nonce']) is str)
    try:
        nonce = uuid.UUID(value['nonce'])
        need(str(nonce) == value['nonce'] and nonce.version == 4 and nonce.variant == uuid.RFC_4122)
    except (TypeError, ValueError, AttributeError):
        raise PhaseRejected() from None
    return clone(value)


def identity(value):
    need(type(value) is dict and set(value) == {'device', 'inode'}
         and number(value['device']) and number(value['inode']) and value['inode'] > 0)
    return clone(value)


def assess(sample, stage, phase='processing'):
    """Assess observed counters only; never select a phase from memory.max."""
    _stage(stage)
    required = {'configuredLimit', 'swapMaximum', 'kernelLifetimePeakBytes',
                'currentBytes', 'swapCurrentBytes', 'events'}
    need(type(sample) is dict and required <= set(sample) <= required | {'capacityMeasurement'})
    events = sample['events']
    need(type(events) is dict and REQUIRED_EVENTS <= set(events) <= EVENTS
         and all(number(v) for v in events.values())
         and all(events[k] == 0 for k in REQUIRED_EVENTS)
         and sample['swapMaximum'] == '0' and type(sample['swapCurrentBytes']) is int
         and sample['swapCurrentBytes'] == 0
         and all(number(sample[k]) for k in ('kernelLifetimePeakBytes', 'currentBytes')))
    if 'capacityMeasurement' in sample:
        need(capacity().closed(sample['capacityMeasurement']) is not None)
    if phase == 'processing':
        limits = processing_limits(stage)
        need(sample['configuredLimit'] == str(limits['comparisonBudgetBytes'])
             and all(sample[k] <= limits['maximumConsumptionBytes']
                     for k in ('kernelLifetimePeakBytes', 'currentBytes'))
             and limits['comparisonBudgetBytes'] - sample['kernelLifetimePeakBytes'] >= limits['requiredReserveBytes'])
    else:
        need(phase == 'backup' and 'capacityMeasurement' in sample)
        need(sample['configuredLimit'] == str(HARD_LIMIT))
        detail = sample['capacityMeasurement']
        need(number(detail['last']['hostAvailableBytes'])
             and detail['last']['hostAvailableBytes'] >= HOST_RESERVE)
        try:
            capacity().assess(sample)
        except (TypeError, ValueError, KeyError):
            raise PhaseRejected() from None
    return sample


def validate_host(value):
    """Validate the existing fresh admission's numeric projection, not freshness."""
    keys = {'kernelPageBytes', 'status', 'hostTotalBytes', 'hostAvailableBytes', 'ancestorHeadroomBytes',
            'effectiveAvailableBytes', 'diagnosticHardLimitBytes', 'minimumUnallocatedHostReserveBytes',
            'availableBeyondDiagnosticHardLimitBytes', 'hostMemoryPressure', 'executionAuthority'}
    need(type(value) is dict and set(value) == keys
         and value['status'] == 'PASS_ACTUAL_HOST_CAPACITY_ADMISSION_ONLY'
         and value['executionAuthority'] is False)
    for key in keys - {'status', 'ancestorHeadroomBytes', 'hostMemoryPressure', 'executionAuthority'}:
        need(number(value[key]))
    need(value['kernelPageBytes'] == 4096 and value['diagnosticHardLimitBytes'] == HARD_LIMIT
         and value['minimumUnallocatedHostReserveBytes'] == HOST_RESERVE
         and value['hostTotalBytes'] >= value['hostAvailableBytes'] >= value['effectiveAvailableBytes'] >= HARD_LIMIT + HOST_RESERVE
         and value['availableBeyondDiagnosticHardLimitBytes'] == value['effectiveAvailableBytes'] - HARD_LIMIT)
    ancestor = value['ancestorHeadroomBytes']
    need(ancestor == 'UNLIMITED_ROOT' or number(ancestor))
    need(value['effectiveAvailableBytes'] == (value['hostAvailableBytes'] if ancestor == 'UNLIMITED_ROOT'
                                             else min(value['hostAvailableBytes'], ancestor)))
    psi = value['hostMemoryPressure']
    need(type(psi) is dict and set(psi) == {'some', 'full'})
    for row in psi.values():
        need(type(row) is dict and set(row) == {'avg10', 'avg60', 'avg300', 'total'}
             and number(row['total']) and all(type(row[k]) is int and 0 <= row[k] <= 10000
                                             for k in ('avg10', 'avg60', 'avg300')))
    return clone(value)


def validate_boundary(proof, stage, expected_context):
    keys = {'schema', 'contract', 'profile', 'stage', 'context', 'primaryContainerId',
            'profiles', 'activeProfiles', 'resultChecksVerified', 'exportsVerified',
            'servicesStopped', 'watchStopped', 'firstFailureAbsent', 'resultCounts'}
    need(type(proof) is dict and set(proof) == keys
         and proof['schema'] == BOUNDARY_SCHEMA and proof['contract'] == CONTRACT
         and proof['profile'] == profile(stage) and proof['stage'] == stage
         and context(proof['context']) == context(expected_context)
         and type(proof['primaryContainerId']) is str and re.fullmatch('[a-f0-9]{64}', proof['primaryContainerId'])
         and type(proof['profiles']) is int and proof['profiles'] == 500
         and type(proof['activeProfiles']) is int and proof['activeProfiles'] == 0
         and all(proof[k] is True for k in ('resultChecksVerified', 'exportsVerified', 'servicesStopped',
                                          'watchStopped', 'firstFailureAbsent'))
         and type(proof['resultCounts']) is dict and proof['resultCounts'] == expected_counts(stage)
         and all(type(v) is int for v in proof['resultCounts'].values()))
    return clone(proof)


def boundary(stage, expected_context, primary_container_id, *, result_counts):
    """Build after the genuine pinned closure checks; not permission to skip them."""
    value = {'schema': BOUNDARY_SCHEMA, 'contract': CONTRACT, 'profile': profile(stage),
             'stage': stage, 'context': context(expected_context), 'primaryContainerId': primary_container_id,
             'profiles': 500, 'activeProfiles': 0, 'resultCounts': result_counts,
             **dict.fromkeys(('resultChecksVerified', 'exportsVerified', 'servicesStopped',
                              'watchStopped', 'firstFailureAbsent'), True)}
    return validate_boundary(value, stage, expected_context)


def ack(boundary, processing_sample, backup_initial_sample, host_admission, parent_identity):
    need(type(boundary) is dict)
    value = {'schema': ACK_SCHEMA, 'contract': CONTRACT, 'profile': boundary.get('profile'),
             'stage': boundary.get('stage'), 'context': boundary.get('context'), 'boundary': boundary,
             'processingSample': processing_sample, 'backupInitialSample': backup_initial_sample,
             'hostAdmission': host_admission, 'parentIdentity': parent_identity, 'phase': 'backup',
             'transitionCount': 1, 'processingWindowFrozen': True, 'sameKernelParentIdentity': True,
             **dict.fromkeys(FALSE_FLAGS, False)}
    return validate_ack(value, value['stage'], value['context'])


def validate_ack(value, stage, expected_context, *, expected_identity=None):
    keys = {'schema', 'contract', 'profile', 'stage', 'context', 'boundary', 'processingSample',
            'backupInitialSample', 'hostAdmission', 'parentIdentity', 'phase', 'transitionCount',
            'processingWindowFrozen', 'sameKernelParentIdentity'} | FALSE_FLAGS
    need(type(value) is dict and set(value) == keys and value['schema'] == ACK_SCHEMA
         and value['contract'] == CONTRACT and value['profile'] == profile(stage) and value['stage'] == stage
         and context(value['context']) == context(expected_context)
         and value['phase'] == 'backup' and type(value['transitionCount']) is int and value['transitionCount'] == 1
         and value['processingWindowFrozen'] is True and value['sameKernelParentIdentity'] is True
         and all(value[k] is False for k in FALSE_FLAGS))
    validate_boundary(value['boundary'], stage, expected_context)
    assess(value['processingSample'], stage, 'processing')
    assess(value['backupInitialSample'], stage, 'backup')
    need(value['backupInitialSample']['kernelLifetimePeakBytes'] >= value['processingSample']['kernelLifetimePeakBytes'])
    validate_host(value['hostAdmission'])
    observed_identity = identity(value['parentIdentity'])
    if expected_identity is not None:
        need(observed_identity == identity(expected_identity))
    return clone(value)


def closure(transition_ack, final_backup_sample):
    need(type(transition_ack) is dict and type(final_backup_sample) is dict)
    value = {'schema': CLOSURE_SCHEMA, 'contract': CONTRACT, 'profile': transition_ack.get('profile'),
             'stage': transition_ack.get('stage'), 'context': transition_ack.get('context'),
             'transition': transition_ack, 'finalBackupSample': final_backup_sample,
             'overallKernelLifetimePeakBytes': final_backup_sample.get('kernelLifetimePeakBytes'),
             'processingMemoryChecksCompleted': True, 'backupSafetyChecksCompleted': True,
             'sameKernelParentIdentity': True, 'transitionCount': 1,
             **dict.fromkeys(FALSE_FLAGS, False)}
    return validate_closure(value, value['stage'], value['context'])


def validate_closure(value, stage, expected_context, *, expected_identity=None):
    keys = {'schema', 'contract', 'profile', 'stage', 'context', 'transition', 'finalBackupSample',
            'overallKernelLifetimePeakBytes', 'processingMemoryChecksCompleted', 'backupSafetyChecksCompleted',
            'sameKernelParentIdentity', 'transitionCount'} | FALSE_FLAGS
    need(type(value) is dict and set(value) == keys and value['schema'] == CLOSURE_SCHEMA
         and value['contract'] == CONTRACT and value['profile'] == profile(stage) and value['stage'] == stage
         and context(value['context']) == context(expected_context)
         and type(value['transitionCount']) is int and value['transitionCount'] == 1
         and all(value[k] is True for k in ('processingMemoryChecksCompleted', 'backupSafetyChecksCompleted', 'sameKernelParentIdentity'))
         and all(value[k] is False for k in FALSE_FLAGS))
    transition = validate_ack(value['transition'], stage, expected_context, expected_identity=expected_identity)
    assess(value['finalBackupSample'], stage, 'backup')
    peak = value['finalBackupSample']['kernelLifetimePeakBytes']
    need(number(value['overallKernelLifetimePeakBytes']) and value['overallKernelLifetimePeakBytes'] == peak
         and peak >= transition['backupInitialSample']['kernelLifetimePeakBytes'])
    return clone(value)


class OneWayState:
    """Per-run latch; invalid reads or transitions can never be repaired by retry."""
    def __init__(self, stage, expected_context, *, parent_identity=None):
        self.stage, self.context = _stage(stage), context(expected_context)
        self._identity = identity(parent_identity) if parent_identity is not None else None
        self._phase, self._failed, self._last_peak, self._ack = 'processing', False, 0, None

    @property
    def phase(self):
        return self._phase

    @property
    def failed(self):
        return self._failed

    def fail(self):
        self._failed = True

    def observe(self, sample):
        try:
            need(not self._failed and self._phase in ('processing', 'backup'))
            assess(sample, self.stage, self._phase)
            need(sample['kernelLifetimePeakBytes'] >= self._last_peak)
            self._last_peak = sample['kernelLifetimePeakBytes']
            return sample
        except BaseException:
            self.fail()
            raise

    def enter_processing(self):
        try:
            need(not self._failed and self._phase == 'processing' and self._ack is None)
        except BaseException:
            self.fail()
            raise

    def accept_ack(self, value):
        try:
            need(not self._failed and self._phase == 'processing' and self._ack is None)
            checked = validate_ack(value, self.stage, self.context, expected_identity=self._identity)
            need(checked['processingSample']['kernelLifetimePeakBytes'] >= self._last_peak)
            self._last_peak = checked['backupInitialSample']['kernelLifetimePeakBytes']
            self._ack, self._phase = checked, 'backup'
            return clone(checked)
        except BaseException:
            self.fail()
            raise

    def finish(self, final_sample):
        try:
            need(not self._failed and self._phase == 'backup' and self._ack is not None)
            self.observe(final_sample)
            result = closure(self._ack, final_sample)
            self._phase = 'closed'
            return result
        except BaseException:
            self.fail()
            raise
