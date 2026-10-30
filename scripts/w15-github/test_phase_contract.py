"""Small invented receipts and counters; no kernel write, original or run."""
import sys
sys.dont_write_bytecode = True
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('phase_contract_counterexamples', Path(__file__).with_name('phase_contract.py'))
P = importlib.util.module_from_spec(spec)
spec.loader.exec_module(P)
CTX = {'exactCommit': 'a' * 40, 'runId': '123456789', 'runAttempt': 1,
       'nonce': '26d5a413-5ca7-415c-a412-62fc45b561c8'}
IDENTITY = {'device': 42, 'inode': 100}


def processing(stage='end500', peak=1000000000):
    return {'configuredLimit': str(P.processing_limits(stage)['comparisonBudgetBytes']),
            'swapMaximum': '0', 'kernelLifetimePeakBytes': peak, 'currentBytes': peak,
            'swapCurrentBytes': 0, 'events': dict.fromkeys(('max', 'oom', 'oom_kill', 'oom_group_kill'), 0)}


def backup(peak=3100000000):
    value = processing(peak=peak)
    value['configuredLimit'] = str(P.HARD_LIMIT)
    stat = dict.fromkeys(P.capacity().CATEGORIES, 10000)
    psi = {key: {'avg10': 0, 'avg60': 0, 'avg300': 0, 'total': 0} for key in ('some', 'full')}
    value['capacityMeasurement'] = {'schema': P.capacity().SCHEMA, 'diagnosticOnly': True,
        'legacyPeakLimitBytes': 2048000000, 'legacyPeakExceeded': peak > 2048000000,
        'legacyContractAccepted': False, 'sampleCount': 1, 'maximumObservedCurrentBytes': peak,
        'categoryMaxima': dict(stat), 'last': {'hostAvailableBytes': 8 * 1024**3, 'memoryStat': stat,
          'memoryPressure': psi, 'observedMonotonicNS': 1000000, 'peakCompositionKnown': False},
        'phaseObservations': []}
    return value


def host():
    available = 12 * 1024**3
    return {'kernelPageBytes': 4096, 'status': 'PASS_ACTUAL_HOST_CAPACITY_ADMISSION_ONLY',
            'hostTotalBytes': 16 * 1024**3, 'hostAvailableBytes': available,
            'ancestorHeadroomBytes': 'UNLIMITED_ROOT', 'effectiveAvailableBytes': available,
            'diagnosticHardLimitBytes': P.HARD_LIMIT, 'minimumUnallocatedHostReserveBytes': P.HOST_RESERVE,
            'availableBeyondDiagnosticHardLimitBytes': available - P.HARD_LIMIT,
            'hostMemoryPressure': {key: {'avg10': 0, 'avg60': 0, 'avg300': 0, 'total': 0}
                                   for key in ('some', 'full')}, 'executionAuthority': False}


def boundary(stage='end500'):
    return P.boundary(stage, CTX, 'b' * 64, result_counts=P.expected_counts(stage))


def acknowledgement(stage='end500'):
    return P.ack(boundary(stage), processing(stage), backup(1000000000), host(), IDENTITY)


class PhaseContractChecks(unittest.TestCase):
    def test_both_fixed_profiles_complete_without_legacy_acceptance_or_peak_reset(self):
        for mode, stage in ((P.END_MODE, 'end500'), (P.MOCK_MODE, 'mock500')):
            self.assertEqual(P.stage(mode), stage)
            state = P.OneWayState(stage, CTX)
            state.observe(processing(stage))
            state.accept_ack(acknowledgement(stage))
            state.observe(backup(3100000000))
            result = state.finish(backup(3680530432))
            self.assertEqual(state.phase, 'closed')
            self.assertEqual(result['overallKernelLifetimePeakBytes'], 3680530432)
            self.assertTrue(result['processingMemoryChecksCompleted'])
            self.assertTrue(result['backupSafetyChecksCompleted'])
            self.assertTrue(all(result[key] is False for key in P.FALSE_FLAGS))
            self.assertEqual(result['transition']['processingSample']['kernelLifetimePeakBytes'], 1000000000)
        for old in ('end500-full-gated', 'mock500-full-gated', P.capacity().MODE, None, True):
            self.assertIsNone(P.stage(old))

    def test_incomplete_69_units_and_actual_historical_memory_failure_stay_separate(self):
        historical = {'simultaneouslyActiveProfiles': 500, 'units': 69, 'providerPhases': 138,
                      'storedResults': 207, 'controls': 1104}
        with self.assertRaises(P.PhaseRejected):
            P.boundary('mock500', CTX, 'b' * 64, result_counts=historical)
        historical_peak = 1640103936  # Full run28c, 69 complete units; not diagnosisC.
        self.assertGreater(historical_peak, P.processing_limits('mock500')['maximumConsumptionBytes'])
        state = P.OneWayState('mock500', CTX)
        with self.assertRaises(P.PhaseRejected): state.observe(processing('mock500', historical_peak))
        self.assertTrue(state.failed)
        # Even a later otherwise valid complete boundary cannot cure that error.
        with self.assertRaises(P.PhaseRejected): state.accept_ack(acknowledgement('mock500'))
        with self.assertRaises(P.PhaseRejected): state.observe(backup(historical_peak))
        bad = acknowledgement('mock500')
        bad['processingSample'] = processing('mock500', historical_peak)
        with self.assertRaises(P.PhaseRejected): P.validate_ack(bad, 'mock500', CTX)
        # DiagnosisC is a different failed run:247 completedAuth and zero units.
        with self.assertRaises(P.PhaseRejected): P.assess(processing('mock500', 1644748800), 'mock500')

    def test_early_boundary_requires_all_results_exports_stops_and_first_error_absence(self):
        for key in ('resultChecksVerified', 'exportsVerified', 'servicesStopped', 'watchStopped', 'firstFailureAbsent'):
            bad = boundary(); bad[key] = False
            with self.assertRaises(P.PhaseRejected): P.validate_boundary(bad, 'end500', CTX)
        for path, value in (('activeProfiles', 1), ('profiles', 499), ('primaryContainerId', 'c' * 63)):
            bad = boundary(); bad[path] = value
            with self.assertRaises(P.PhaseRejected): P.validate_boundary(bad, 'end500', CTX)
        bad = boundary(); bad['resultCounts']['authCAS'] = 499
        with self.assertRaises(P.PhaseRejected): P.validate_boundary(bad, 'end500', CTX)

    def test_transition_is_once_and_processing_can_never_reopen(self):
        for operation in ('accept_ack', 'enter_processing'):
            state = P.OneWayState('end500', CTX)
            state.accept_ack(acknowledgement())
            with self.assertRaises(P.PhaseRejected):
                state.accept_ack(acknowledgement()) if operation == 'accept_ack' else state.enter_processing()
            self.assertTrue(state.failed)
            with self.assertRaises(P.PhaseRejected): state.finish(backup())
        state = P.OneWayState('end500', CTX)
        with self.assertRaises(P.PhaseRejected): state.finish(backup())

    def test_peak_counter_never_goes_backwards_at_transition_or_final_readback(self):
        bad = acknowledgement(); bad['backupInitialSample'] = backup(999999999)
        with self.assertRaises(P.PhaseRejected): P.validate_ack(bad, 'end500', CTX)
        state = P.OneWayState('end500', CTX)
        state.observe(processing(peak=1100000000))
        with self.assertRaises(P.PhaseRejected): state.accept_ack(acknowledgement())
        state = P.OneWayState('end500', CTX); state.accept_ack(acknowledgement())
        state.observe(backup(3100000000))
        with self.assertRaises(P.PhaseRejected): state.finish(backup(3000000000))
        result = P.closure(acknowledgement(), backup())
        result['overallKernelLifetimePeakBytes'] -= 1
        with self.assertRaises(P.PhaseRejected): P.validate_closure(result, 'end500', CTX)

    def test_fixed_hard_limits_swap_oom_and_unknown_host_headroom_still_stop(self):
        for change in ({'kernelLifetimePeakBytes': P.HARD_LIMIT + 1}, {'currentBytes': P.HARD_LIMIT + 1},
                       {'swapCurrentBytes': 1}, {'swapMaximum': 'max'},
                       {'events': {'max': 1, 'oom': 0, 'oom_kill': 0, 'oom_group_kill': 0}}):
            bad = backup(); bad.update(change)
            with self.assertRaises(P.PhaseRejected): P.assess(bad, 'end500', 'backup')
        for amount in ('UNKNOWN', P.HOST_RESERVE - 1):
            bad = backup(); bad['capacityMeasurement']['last']['hostAvailableBytes'] = amount
            with self.assertRaises(P.PhaseRejected): P.assess(bad, 'end500', 'backup')
        bad = backup(); del bad['capacityMeasurement']
        with self.assertRaises(P.PhaseRejected): P.assess(bad, 'end500', 'backup')
        # The larger fixed ceiling is never admitted in processing.
        with self.assertRaises(P.PhaseRejected): P.assess(backup(1000000000), 'end500', 'processing')

    def test_closed_binding_rejects_replay_wrong_stage_identity_and_extra_private_text(self):
        for mutation in ('nonce', 'stage', 'identity', 'extra', 'host', 'flag'):
            bad = acknowledgement()
            if mutation == 'nonce': bad['context']['nonce'] = '5e2851e3-4ffc-4f4b-a363-b13241b86efc'
            if mutation == 'stage': bad['stage'] = 'mock500'
            if mutation == 'identity': bad['parentIdentity']['inode'] = 0
            if mutation == 'extra': bad['PRIVATE_TEXT'] = 'FICTIONAL_NOT_A_SECRET'
            if mutation == 'host': bad['hostAdmission']['effectiveAvailableBytes'] = P.HARD_LIMIT
            if mutation == 'flag': bad['commonLifetimeMemoryAccepted'] = True
            with self.assertRaises(P.PhaseRejected): P.validate_ack(bad, 'end500', CTX)
        for invalid in (None, [], 'PRIVATE_FAKE'):
            with self.assertRaises(P.PhaseRejected): P.ack(invalid, processing(), backup(), host(), IDENTITY)
            with self.assertRaises(P.PhaseRejected): P.closure(invalid, backup())
        state = P.OneWayState('end500', CTX, parent_identity={'device': 42, 'inode': 101})
        with self.assertRaises(P.PhaseRejected): state.accept_ack(acknowledgement())

    def test_function_reference_is_only_pinned_function_evidence_not_restore_ram_acceptance(self):
        self.assertEqual(P.FUNCTION_REFERENCE['runId'], '41132913871')
        self.assertFalse(P.FUNCTION_REFERENCE['legacyRestoreAccepted'])
        self.assertEqual(len(P.FUNCTION_REFERENCE['receiptSHA256']), 64)
        limits = P.processing_limits('mock500'); limits['maximumConsumptionBytes'] = P.HARD_LIMIT
        self.assertEqual(P.processing_limits('mock500')['maximumConsumptionBytes'], 1638400000)
        with self.assertRaises(P.PhaseRejected): P.assess(processing('mock500', 1640103936), 'mock500')


if __name__ == '__main__':
    unittest.main()
