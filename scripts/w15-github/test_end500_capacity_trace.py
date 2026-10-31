"""Only fictional guard samples; no kernel, process, file or original activity."""
import sys
sys.dont_write_bytecode = True

import copy
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('end500_capacity_trace_tested', Path(__file__).with_name('end500_capacity_trace.py'))
T = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(T)


def phase(sequence=1):
    return {'name': 'end500', 'sequence': sequence, 'meaning': 'ENTERED_NOT_COMPLETED'}


def sample(peak=3680530432, current=2000000000, stamp=100, **stat):
    categories = {name: stat.get(name, 0) for name in T.CATEGORIES}
    last = {'hostAvailableBytes': T.CAP.HOST_RESERVE, 'memoryStat': categories,
        'memoryPressure': {kind: {'avg10': 0, 'avg60': 0, 'avg300': 0, 'total': 0} for kind in ('some', 'full')},
        'observedMonotonicNS': stamp, 'peakCompositionKnown': False}
    detail = {'schema': T.CAP.SCHEMA, 'diagnosticOnly': True, 'legacyPeakLimitBytes': T.CAP.LEGACY_PEAK,
        'legacyPeakExceeded': peak > T.CAP.LEGACY_PEAK, 'legacyContractAccepted': False, 'sampleCount': 1,
        'maximumObservedCurrentBytes': current, 'categoryMaxima': categories, 'last': last, 'phaseObservations': []}
    return {'configuredLimit': str(T.CAP.HARD_LIMIT), 'swapMaximum': '0', 'swapCurrentBytes': 0,
        'kernelLifetimePeakBytes': peak, 'currentBytes': current, 'events': dict.fromkeys(T.EVENTS, 0),
        'capacityMeasurement': detail}


def components(amount=100):
    return {'sameParentIdentityObserved': True, 'pidInventoryStable': True, 'allObservedProcessesBound': True,
        'allDeclaredProcessesObserved': True, 'roleBindingCollisions': 0, 'snapshotAtomic': False,
        'fileCacheAdditiveToPSS': False, 'peakCompositionKnown': False,
        'roles': {role: {'observedPSSBytes': amount, 'completeComponentPSSBytes': amount} for role in T.ROLES}}


def at(result, key, category=None):
    reference = result[key] if category is None else result[key][category]
    return next(row for row in result['snapshots'] if row['sampleNumber'] == reference)


class CapacityTraceChecks(unittest.TestCase):
    def test_complete_samples_keep_legacy_failure_separate_and_maxima_simultaneous(self):
        trace = T.Collector()
        # Patching reads proves aggregation never reaches CAP.capture or the OS.
        with patch.object(T.CAP, 'capture', side_effect=AssertionError('must not read kernel')):
            trace.observe(sample(stamp=100, file=1600000000, anon=300000000), phase=phase(),
                progress={'authCAS': {'value': 12, 'kind': 'CONFIRMED_LOWER_BOUND'}}, components=components(100))
            trace.observe(sample(stamp=200, file=1800000000, anon=200000000), phase=phase(),
                progress={'authCAS': {'value': 13, 'kind': 'EXACT'}}, components=components(120))
        result = trace.summary()
        self.assertIsNotNone(T.closed(result))
        self.assertTrue(result['legacyPeakExceeded']); self.assertFalse(result['legacyContractAccepted'])
        self.assertFalse(result['anyCapacitySafetyFailureOrUnknown']); self.assertFalse(result['end500Acceptance'])
        self.assertEqual(result['kernelPeakOccurrenceTime'], 'UNKNOWN')
        self.assertEqual(at(result, 'kernelPeakFirstObserved')['observedMonotonicNS'], 100)
        self.assertEqual(at(result, 'categoryMaxima', 'file')['observedMonotonicNS'], 200)
        self.assertEqual(at(result, 'categoryMaxima', 'file')['memoryStat']['anon'], 200000000)
        self.assertEqual(at(result, 'categoryMaxima', 'anon')['observedMonotonicNS'], 100)
        self.assertEqual(result['componentPSSMaxima']['postgresql']['value'], 120)
        self.assertEqual(result['progress']['authCAS']['kind'], 'EXACT')
        self.assertEqual(result['progress']['usageRows'], 'UNKNOWN')
        self.assertFalse(result['fileCacheAdditiveToPSS']); self.assertFalse(result['peakCompositionKnown'])

    def test_missing_invalid_and_failure_samples_survive_without_invented_zero(self):
        trace = T.Collector()
        self.assertIsNotNone(T.closed(trace.summary()))
        self.assertEqual(trace.summary()['kernelLifetimePeakBytes'], 'UNKNOWN')
        trace.observe({'currentBytes': 123, 'privateURL': 'DO_NOT_EXPORT', 'configuredLimit': '9' * 5000}, phase='DO_NOT_EXPORT')
        trace.observe(sample(stamp=200), phase=phase())
        result = trace.summary()
        self.assertIsNotNone(T.closed(result)); self.assertEqual(result['sampleCount'], 2)
        self.assertEqual(at(result, 'first')['kernelLifetimePeakBytes'], 'UNKNOWN')
        self.assertEqual(at(result, 'firstCapacitySafetyFailureOrUnknown')['currentBytes'], 123)
        self.assertEqual(result['capacitySafetyFailureOrUnknownCount'], 1)
        self.assertNotIn('DO_NOT_EXPORT', json.dumps(result)); self.assertNotIn('privateURL', json.dumps(result))
        self.assertEqual(at(result, 'first')['componentPSSBytes']['helmut-node'], 'UNKNOWN')

    def test_exact_and_confirmed_lower_bounds_are_closed_and_never_fabricated(self):
        trace = T.Collector()
        trace.observe(sample(), progress={'authCAS': {'value': 500, 'kind': 'EXACT'},
            'usageRows': {'value': 6000, 'kind': 'CONFIRMED_LOWER_BOUND'},
            'nativePostimages': {'value': 3501, 'kind': 'EXACT'}})
        result = trace.summary(); self.assertIsNotNone(T.closed(result))
        self.assertEqual(result['progress']['usageRows']['kind'], 'CONFIRMED_LOWER_BOUND')
        history = dict(zip(result['seriesColumns'], result['history'][-1], strict=True))
        self.assertEqual(history['authCASKind'], 'EXACT')
        self.assertEqual(history['usageRowsKind'], 'CONFIRMED_LOWER_BOUND')
        trace.observe(sample(stamp=200), progress={'authCAS': {'value': True, 'kind': 'EXACT'},
            'usageRows': {'value': 6001, 'kind': 'EXACT'}, 'nativePostimages': {'value': 3, 'kind': 'UNCONFIRMED'}})
        result = trace.summary(); self.assertIsNotNone(T.closed(result))
        self.assertEqual(at(result, 'last')['progress'], dict.fromkeys(T.COUNTERS, 'UNKNOWN'))
        self.assertEqual(result['progress']['authCAS']['sampleNumber'], 1)

    def test_pss_requires_existing_complete_stable_identity_bound_observation(self):
        for field, bad in [('sameParentIdentityObserved', False), ('pidInventoryStable', False), ('fileCacheAdditiveToPSS', True)]:
            with self.subTest(field=field):
                comp = components(); comp[field] = bad; comp['privatePID'] = 'DO_NOT_EXPORT'
                trace = T.Collector(); trace.observe(sample(), components=comp)
                result = trace.summary(); self.assertIsNotNone(T.closed(result))
                self.assertEqual(at(result, 'last')['componentPSSBytes'], dict.fromkeys(T.ROLES, 'UNKNOWN'))
                self.assertNotIn('DO_NOT_EXPORT', json.dumps(result))
        partial = components(); partial['allObservedProcessesBound'] = False
        partial['roles']['helmut-node'] = {'observedPSSBytes': 'UNKNOWN', 'completeComponentPSSBytes': 'UNKNOWN'}
        for row in partial['roles'].values(): row['completeComponentPSSBytes'] = 'UNKNOWN'
        trace = T.Collector(); trace.observe(sample(), components=partial); result = trace.summary()
        self.assertIsNotNone(T.closed(result))
        self.assertEqual(at(result, 'last')['componentPSSBytes']['postgresql'], [100, 'CONFIRMED_LOWER_BOUND'])
        self.assertEqual(at(result, 'last')['componentPSSBytes']['helmut-node'], 'UNKNOWN')
        self.assertEqual(result['componentPSSMaxima']['postgresql']['kind'], 'CONFIRMED_LOWER_BOUND')

    def test_capacity_safety_stays_strict_but_diagnostic_collection_never_aborts(self):
        rows = []
        bad = sample(); bad['configuredLimit'] = '2560000000'; rows.append(bad)
        bad = sample(); bad['kernelLifetimePeakBytes'] = T.CAP.HARD_LIMIT + 1; rows.append(bad)
        bad = sample(); bad['events']['oom_kill'] = 1; rows.append(bad)
        bad = sample(); bad['swapCurrentBytes'] = 1; rows.append(bad)
        bad = sample(); bad['capacityMeasurement']['last']['hostAvailableBytes'] = T.CAP.HOST_RESERVE - 1; rows.append(bad)
        for value in rows:
            trace = T.Collector(); trace.observe(value)
            result = trace.summary(); self.assertIsNotNone(T.closed(result))
            self.assertTrue(result['anyCapacitySafetyFailureOrUnknown'])
            self.assertEqual(at(result, 'last')['capacitySafetyObservation'], 'FAIL_OR_UNKNOWN')
        self.assertEqual(T.CAP.MODE, 'end500-restore-capacity-diagnostic')
        self.assertEqual(T.CAP.LEGACY_PEAK, 2048000000)

    def test_peak_never_resets_and_nonmonotonic_observations_are_visible(self):
        trace = T.Collector(); trace.observe(sample(stamp=200), phase=phase(2))
        trace.observe(sample(peak=1000, current=1000, stamp=100), phase=phase(1))
        result = trace.summary(); self.assertIsNotNone(T.closed(result))
        self.assertEqual(result['kernelLifetimePeakBytes'], 3680530432)
        self.assertFalse(result['kernelPeakMonotonic']); self.assertFalse(result['observedTimeMonotonic'])
        self.assertFalse(result['phaseSequenceMonotonic']); self.assertTrue(result['legacyPeakExceeded'])

    def test_long_run_and_all128_phase_frames_stay_bounded_and_keep_extrema(self):
        trace = T.Collector()
        for i in range(1000):
            n = 2**53 - 1 - i
            trace.observe(sample(peak=n, current=n, stamp=i, **dict.fromkeys(T.CATEGORIES, n)),
                phase=phase(min(i + 1, 128)), components=components(n))
        result = trace.summary()
        self.assertIsNotNone(T.closed(result)); self.assertEqual(result['phaseCoverage']['observed'], 128)
        self.assertEqual(result['phaseObservations'][0]['phase']['sequence'], 1)
        self.assertEqual(result['phaseObservations'][-1]['phase']['sequence'], 128)
        self.assertLessEqual(len(result['history']), T.MAX_HISTORY)
        self.assertLessEqual(len(T._encode(result)), T.MAX_BYTES)
        self.assertTrue(result['historyDecimated']); self.assertEqual(at(result, 'last')['sampleNumber'], 1000)
        self.assertEqual(at(result, 'categoryMaxima', 'file')['sampleNumber'], 1)
        self.assertEqual(at(result, 'firstCapacitySafetyFailureOrUnknown')['sampleNumber'], 1)
        if not result['phaseCoverage']['complete']:
            self.assertLess(result['phaseCoverage']['included'], 128)

    def test_public_schema_rejects_extra_private_fields_free_text_and_bad_values(self):
        trace = T.Collector(); trace.observe(sample(), phase=phase()); original = trace.summary()
        mutations = []
        bad = copy.deepcopy(original); bad['secret'] = 'DO_NOT_EXPORT'; mutations.append(bad)
        bad = copy.deepcopy(original); at(bad, 'last')['phase']['name'] = 'private text'; mutations.append(bad)
        bad = copy.deepcopy(original); at(bad, 'last')['memoryStat']['pid'] = 1234; mutations.append(bad)
        bad = copy.deepcopy(original); bad['history'][0][1] = 'private text'; mutations.append(bad)
        bad = copy.deepcopy(original); bad['legacyContractAccepted'] = True; mutations.append(bad)
        bad = copy.deepcopy(original); bad['kernelLifetimePeakBytes'] = 1; mutations.append(bad)
        bad = copy.deepcopy(original); bad['progress']['authCAS'] = {'value': 501, 'kind': 'EXACT', 'observedMonotonicNS': 1, 'sampleNumber': 1}; mutations.append(bad)
        for row in mutations: self.assertIsNone(T.closed(row))
        accepted = T.closed(original); at(accepted, 'last')['memoryStat']['file'] = 999
        self.assertEqual(at(trace.summary(), 'last')['memoryStat']['file'], 0)

    def test_20k_ipc_bound_keeps_distinct_extrema_and_explicit_phase_coverage(self):
        trace = T.Collector(); maximum = 2**53 - 1
        for i in range(1280):
            stat = {name: maximum - abs(i - (offset + 2)) * 10000 for offset, name in enumerate(T.CATEGORIES)}
            row = sample(peak=maximum - 1280 + i, current=maximum - i, stamp=maximum - 5000 + i, **stat)
            trace.observe(row, phase=phase(i // 10 + 1), components=components(maximum - i),
                progress={name: {'value': bound, 'kind': 'CONFIRMED_LOWER_BOUND'} for name, bound in T.COUNTERS.items()})
        result = trace.summary(); self.assertIsNotNone(T.closed(result))
        self.assertLessEqual(len(T._encode(result)), 20480)
        self.assertEqual(result['phaseCoverage']['observed'], 128)
        self.assertEqual(result['phaseObservations'][0]['phase']['sequence'], 1)
        self.assertEqual(result['phaseObservations'][-1]['phase']['sequence'], 128)
        self.assertEqual(at(result, 'first')['sampleNumber'], 1)
        self.assertEqual(at(result, 'last')['sampleNumber'], 1280)
        self.assertEqual(result['kernelLifetimePeakBytes'], maximum - 1)
        for offset, name in enumerate(T.CATEGORIES):
            self.assertEqual(at(result, 'categoryMaxima', name)['sampleNumber'], offset + 3)
        self.assertEqual(result['progress']['authCAS']['value'], 500)
        self.assertFalse(result['legacyContractAccepted'])


if __name__ == '__main__': unittest.main()
