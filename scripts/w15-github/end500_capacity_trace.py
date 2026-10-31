"""Bounded pure End500 capacity telemetry; no monitor, IO or run authority.

Input is an existing guard sample. Kernel lifetime peaks are observations of a
past maximum, never a composition or an exact occurrence timestamp. File/shmem
and optional process PSS are overlapping measurements and are never added.
"""
import sys
sys.dont_write_bytecode = True

import copy
import importlib.util
import json
from pathlib import Path


def _load(name):
    spec = importlib.util.spec_from_file_location('w15_end_capacity_trace_' + name, Path(__file__).with_name(name + '.py'))
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


CAP, DIAG, COMPONENTS = _load('restore_capacity'), _load('runner_diagnostics'), _load('memory_components')
MODE = 'end500-full-capacity-diagnostic'
SCOPE = 'ISOLATED_GITHUB_END500_CAPACITY_DIAGNOSTIC_ONLY'
PROFILE = 'helmut-w15-end500-capacity-diagnostic/1'
SCHEMA = 'helmut-w15-end500-capacity-trace/1'
UNKNOWN = CAP.UNKNOWN
CATEGORIES, ROLES = CAP.CATEGORIES, COMPONENTS.ROLES
EVENTS = ('max', 'oom', 'oom_kill', 'oom_group_kill')
COUNTERS = {'authCAS': 500, 'usageRows': 6000, 'nativePostimages': 3501}
MAX_PHASES, MAX_HISTORY, MAX_BYTES = 128, 150, 20 * 1024
POINT_COLUMNS = ('observedMonotonicNS', 'currentBytes', 'kernelLifetimePeakBytes')
SERIES_COLUMNS = ('sampleNumber', 'observedMonotonicNS', 'phaseSequence', 'kernelLifetimePeakBytes',
    'currentBytes', *CATEGORIES, 'hostAvailableBytes', *(part for name in COUNTERS for part in (name + 'Value', name + 'Kind')))


def _number(value):
    return CAP.number(value)


def _measurement(value):
    return value if _number(value) else UNKNOWN


def _decimal(value):
    return int(value) if type(value) is str and 1 <= len(value) <= 16 and value.isascii() and value.isdigit() and _number(int(value)) else UNKNOWN


def _phase(value):
    checked = DIAG.phase_observation(value)
    return checked if checked is not None else UNKNOWN


def _pressure(value):
    if type(value) is not dict or set(value) != {'some', 'full'}: return UNKNOWN
    for row in value.values():
        if (type(row) is not dict or set(row) != {'avg10', 'avg60', 'avg300', 'total'}
            or not _number(row['total'])
            or any(type(row[k]) is not int or not 0 <= row[k] <= 10000 for k in ('avg10', 'avg60', 'avg300'))):
            return UNKNOWN
    return copy.deepcopy(value)


def _progress(value):
    result = {}
    for name, maximum in COUNTERS.items():
        row = value.get(name) if type(value) is dict else None
        result[name] = ({'value': row['value'], 'kind': row['kind']} if type(row) is dict
            and set(row) == {'value', 'kind'} and type(row['value']) is int and 0 <= row['value'] <= maximum
            and type(row['kind']) is str and row['kind'] in ('EXACT', 'CONFIRMED_LOWER_BOUND') else UNKNOWN)
    return result


def _component_pss(value):
    result = dict.fromkeys(ROLES, UNKNOWN)
    if (type(value) is not dict or any(value.get(k) is not True for k in (
        'sameParentIdentityObserved', 'pidInventoryStable'))
        or type(value.get('roleBindingCollisions')) is not int or not 0 <= value['roleBindingCollisions'] <= COMPONENTS.MAX_PIDS
        or value.get('snapshotAtomic') is not False or value.get('fileCacheAdditiveToPSS') is not False
        or value.get('peakCompositionKnown') is not False or type(value.get('roles')) is not dict
        or set(value['roles']) != set(ROLES)):
        return result
    complete = (value.get('allObservedProcessesBound') is True and value.get('allDeclaredProcessesObserved') is True
                and value['roleBindingCollisions'] == 0)
    for role in ROLES:
        row = value['roles'][role]
        if type(row) is dict and _number(row.get('observedPSSBytes')):
            if complete:
                if _number(row.get('completeComponentPSSBytes')) and row['observedPSSBytes'] == row['completeComponentPSSBytes']:
                    result[role] = [row['completeComponentPSSBytes'], 'COMPLETE']
            else:
                result[role] = [row['observedPSSBytes'], 'CONFIRMED_LOWER_BOUND']
    return result


def _snapshot(sample, phase, progress, components, sequence):
    sample = sample if type(sample) is dict else {}
    detail = sample.get('capacityMeasurement')
    last = detail.get('last') if type(detail) is dict else None
    last = last if type(last) is dict else {}
    stat = last.get('memoryStat'); stat = stat if type(stat) is dict else {}
    events = sample.get('events'); events = events if type(events) is dict else {}
    safety = 'FAIL_OR_UNKNOWN'
    try:
        CAP.assess(sample)
        if CAP.closed(detail) is not None and _number(last.get('hostAvailableBytes')) and last['hostAvailableBytes'] >= CAP.HOST_RESERVE:
            safety = 'PASS_OBSERVED_CAPACITY_SAFETY_ONLY'
    except Exception:
        pass
    return {'sampleNumber': sequence, 'observedMonotonicNS': _measurement(last.get('observedMonotonicNS')),
        'phase': _phase(phase), 'kernelLifetimePeakBytes': _measurement(sample.get('kernelLifetimePeakBytes')),
        'currentBytes': _measurement(sample.get('currentBytes')),
        'configuredLimitBytes': _decimal(sample.get('configuredLimit')),
        'swapMaximumBytes': _decimal(sample.get('swapMaximum')),
        'swapCurrentBytes': _measurement(sample.get('swapCurrentBytes')),
        'events': {name: _measurement(events.get(name)) for name in EVENTS},
        'hostAvailableBytes': _measurement(last.get('hostAvailableBytes')),
        'memoryStat': {name: _measurement(stat.get(name)) for name in CATEGORIES},
        'memoryPressure': _pressure(last.get('memoryPressure')), 'componentPSSBytes': _component_pss(components),
        'progress': _progress(progress), 'capacitySafetyObservation': safety,
        'snapshotAtomic': False, 'peakCompositionKnown': False, 'fileCacheAdditiveToPSS': False}


def _series(row):
    return [row['sampleNumber'], row['observedMonotonicNS'],
        row['phase']['sequence'] if type(row['phase']) is dict else UNKNOWN,
        row['kernelLifetimePeakBytes'], row['currentBytes'],
        *(row['memoryStat'][key] for key in CATEGORIES), row['hostAvailableBytes'],
        *(row['progress'][key][field] if type(row['progress'][key]) is dict else UNKNOWN
          for key in COUNTERS for field in ('value', 'kind'))]


def _point(row):
    return [row[key] for key in POINT_COLUMNS]


class Collector:
    """Caller-owned aggregation only; observe never reads or changes the OS."""
    def __init__(self):
        self._count = 0; self._first = self._last = UNKNOWN
        self._peak = self._current = UNKNOWN
        self._categories = dict.fromkeys(CATEGORIES, UNKNOWN)
        self._components = dict.fromkeys(ROLES, UNKNOWN)
        self._phases, self._history = [], []
        self._progress = dict.fromkeys(COUNTERS, UNKNOWN)
        self._peak_monotone = self._time_monotone = self._phase_monotone = True
        self._last_peak = self._last_time = UNKNOWN
        self._safety_failed_or_unknown = False
        self._first_safety_failure_or_unknown = UNKNOWN
        self._safety_failure_or_unknown_count = 0
        self._history_stride = 1

    def observe(self, sample, *, phase=UNKNOWN, progress=None, components=None):
        self._count += 1
        row = _snapshot(sample, phase, progress, components, self._count)
        if self._first == UNKNOWN: self._first = copy.deepcopy(row)
        self._last = row
        for name, previous in (('kernelLifetimePeakBytes', self._last_peak), ('observedMonotonicNS', self._last_time)):
            value = row[name]
            if _number(value) and _number(previous) and value < previous:
                if name == 'kernelLifetimePeakBytes': self._peak_monotone = False
                else: self._time_monotone = False
        if _number(row['kernelLifetimePeakBytes']): self._last_peak = row['kernelLifetimePeakBytes']
        if _number(row['observedMonotonicNS']): self._last_time = row['observedMonotonicNS']
        for attribute, field in (('_peak', 'kernelLifetimePeakBytes'), ('_current', 'currentBytes')):
            old = getattr(self, attribute)
            if _number(row[field]) and (old == UNKNOWN or row[field] > old[field]):
                setattr(self, attribute, copy.deepcopy(row))
        for name in CATEGORIES:
            old = self._categories[name]; value = row['memoryStat'][name]
            if _number(value) and (old == UNKNOWN or value > old['memoryStat'][name]):
                self._categories[name] = copy.deepcopy(row)
        for name in ROLES:
            old = self._components[name]; value = row['componentPSSBytes'][name]
            if type(value) is list and (old == UNKNOWN or value[0] > old['componentPSSBytes'][name][0]):
                self._components[name] = copy.deepcopy(row)
        for name in COUNTERS:
            value = row['progress'][name]
            if type(value) is dict:
                self._progress[name] = {**value, 'observedMonotonicNS': row['observedMonotonicNS'], 'sampleNumber': row['sampleNumber']}
        self._safety_failed_or_unknown |= row['capacitySafetyObservation'] != 'PASS_OBSERVED_CAPACITY_SAFETY_ONLY'
        if row['capacitySafetyObservation'] != 'PASS_OBSERVED_CAPACITY_SAFETY_ONLY':
            self._safety_failure_or_unknown_count += 1
            if self._first_safety_failure_or_unknown == UNKNOWN: self._first_safety_failure_or_unknown = copy.deepcopy(row)
        observed_phase = row['phase']
        if type(observed_phase) is dict:
            if self._phases and observed_phase['sequence'] < self._phases[-1]['phase']['sequence']:
                self._phase_monotone = False
            elif self._phases and observed_phase == self._phases[-1]['phase']:
                target = self._phases[-1]; target['last'] = _point(row); target['sampleCount'] += 1
                for index, name in enumerate(CATEGORIES):
                    value, old = row['memoryStat'][name], target['categoryMaxima'][index][0]
                    if _number(value) and (old == UNKNOWN or value > old):
                        target['categoryMaxima'][index] = [value, row['observedMonotonicNS']]
            elif not self._phases or observed_phase['sequence'] > self._phases[-1]['phase']['sequence']:
                if len(self._phases) < MAX_PHASES:
                    self._phases.append({'phase': observed_phase, 'sampleCount': 1, 'first': _point(row), 'last': _point(row),
                        'categoryMaxima': [[row['memoryStat'][name], row['observedMonotonicNS']]
                            if _number(row['memoryStat'][name]) else [UNKNOWN, UNKNOWN] for name in CATEGORIES]})
            else:
                self._phase_monotone = False
        if self._count % self._history_stride == 0 or not self._history:
            self._history.append(_series(row))
        if len(self._history) > MAX_HISTORY:
            self._history = self._history[::2]
            self._history_stride *= 2
        return None

    def summary(self):
        peak = self._peak['kernelLifetimePeakBytes'] if type(self._peak) is dict else UNKNOWN
        snapshots = {}
        def reference(row):
            if row == UNKNOWN: return UNKNOWN
            snapshots[row['sampleNumber']] = copy.deepcopy(row)
            return row['sampleNumber']
        def component_maximum(row, role):
            if row == UNKNOWN: return UNKNOWN
            return {'value': row['componentPSSBytes'][role][0], 'kind': row['componentPSSBytes'][role][1], 'sampleNumber': row['sampleNumber'],
                    'observedMonotonicNS': row['observedMonotonicNS'],
                    'phaseSequence': row['phase']['sequence'] if type(row['phase']) is dict else UNKNOWN}
        history = copy.deepcopy(self._history)
        if type(self._last) is dict and (not history or history[-1][0] != self._last['sampleNumber']):
            history.append(_series(self._last))
        result = {'schema': SCHEMA, 'mode': MODE, 'scope': SCOPE, 'profile': PROFILE,
            'diagnosticOnly': True, 'executionAuthority': False, 'legacyContractAccepted': False,
            'end500Acceptance': False, 'productionAcceptance': False,
            'hardLimitBytes': CAP.HARD_LIMIT, 'minimumHostReserveBytes': CAP.HOST_RESERVE,
            'legacyPeakScope': 'COMMON_PARENT_LIFETIME_ALL_PHASES',
            'legacyPeakLimitBytes': CAP.LEGACY_PEAK, 'legacyPeakExceeded': peak > CAP.LEGACY_PEAK if _number(peak) else UNKNOWN,
            'sampleCount': self._count, 'kernelLifetimePeakBytes': peak,
            'kernelPeakOccurrenceTime': UNKNOWN, 'kernelPeakFirstObserved': reference(self._peak),
            'maximumObservedCurrent': reference(self._current), 'first': reference(self._first), 'last': reference(self._last),
            'categoryOrder': list(CATEGORIES), 'categoryMaxima': {name: reference(row) for name, row in self._categories.items()},
            'componentPSSMaxima': {name: component_maximum(row, name) for name, row in self._components.items()},
            'phasePointColumns': list(POINT_COLUMNS), 'phaseObservations': copy.deepcopy(self._phases),
            'phaseCoverage': {'observed': len(self._phases), 'included': len(self._phases), 'complete': True},
            'seriesColumns': list(SERIES_COLUMNS), 'history': history,
            'historyDecimated': self._history_stride > 1, 'observedHistoryStride': self._history_stride,
            'progress': copy.deepcopy(self._progress),
            'kernelPeakMonotonic': self._peak_monotone, 'observedTimeMonotonic': self._time_monotone,
            'phaseSequenceMonotonic': self._phase_monotone,
            'anyCapacitySafetyFailureOrUnknown': self._safety_failed_or_unknown,
            'capacitySafetyFailureOrUnknownCount': self._safety_failure_or_unknown_count,
            'firstCapacitySafetyFailureOrUnknown': reference(self._first_safety_failure_or_unknown),
            'peakCompositionKnown': False, 'snapshotAtomic': False, 'fileCacheAdditiveToPSS': False}
        result['snapshots'] = [snapshots[index] for index in sorted(snapshots)]
        while len(result['history']) > MAX_HISTORY or len(_encode(result)) > MAX_BYTES:
            if result['history']:
                result['history'] = result['history'][::2] if len(result['history']) > 1 else []
                result['historyDecimated'] = True
            elif len(result['phaseObservations']) > 2:
                phases = result['phaseObservations']
                result['phaseObservations'] = [phases[0], *phases[2:-1:2], phases[-1]]
                result['phaseCoverage'].update(included=len(result['phaseObservations']), complete=False)
            else:
                raise ValueError('CAPACITY_TRACE_BOUND_EXCEEDED')
        return result


def _encode(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True, allow_nan=False).encode('ascii')


def _valid_number(value):
    return _number(value) or type(value) is str and value == UNKNOWN


def _valid_snapshot(row):
    if row == UNKNOWN: return True
    keys = {'sampleNumber', 'observedMonotonicNS', 'phase', 'kernelLifetimePeakBytes', 'currentBytes', 'configuredLimitBytes',
        'swapMaximumBytes', 'swapCurrentBytes', 'events', 'hostAvailableBytes', 'memoryStat', 'memoryPressure',
        'componentPSSBytes', 'progress', 'capacitySafetyObservation', 'snapshotAtomic', 'peakCompositionKnown', 'fileCacheAdditiveToPSS'}
    if type(row) is not dict or set(row) != keys: return False
    if (not _number(row['sampleNumber']) or not 1 <= row['sampleNumber'] or _phase(row['phase']) != row['phase']
        or any(not _valid_number(row[key]) for key in ('observedMonotonicNS', 'kernelLifetimePeakBytes', 'currentBytes',
            'configuredLimitBytes', 'swapMaximumBytes', 'swapCurrentBytes', 'hostAvailableBytes'))
        or type(row['events']) is not dict or set(row['events']) != set(EVENTS)
        or any(not _valid_number(v) for v in row['events'].values())
        or type(row['memoryStat']) is not dict or set(row['memoryStat']) != set(CATEGORIES)
        or any(not _valid_number(v) for v in row['memoryStat'].values())
        or _pressure(row['memoryPressure']) != row['memoryPressure']
        or type(row['componentPSSBytes']) is not dict or set(row['componentPSSBytes']) != set(ROLES)
        or any(v != UNKNOWN and (type(v) is not list or len(v) != 2 or not _number(v[0])
                or v[1] not in ('COMPLETE', 'CONFIRMED_LOWER_BOUND')) for v in row['componentPSSBytes'].values())
        or _progress(row['progress']) != row['progress']
        or row['capacitySafetyObservation'] not in ('PASS_OBSERVED_CAPACITY_SAFETY_ONLY', 'FAIL_OR_UNKNOWN')
        or any(row[key] is not False for key in ('snapshotAtomic', 'peakCompositionKnown', 'fileCacheAdditiveToPSS'))): return False
    if row['capacitySafetyObservation'] == 'PASS_OBSERVED_CAPACITY_SAFETY_ONLY':
        if (row['configuredLimitBytes'] != CAP.HARD_LIMIT or row['swapMaximumBytes'] != 0 or row['swapCurrentBytes'] != 0
            or not _number(row['hostAvailableBytes']) or row['hostAvailableBytes'] < CAP.HOST_RESERVE
            or any(not _number(row[k]) or row[k] > CAP.HARD_LIMIT for k in ('kernelLifetimePeakBytes', 'currentBytes'))
            or any(v != 0 for v in row['events'].values())): return False
    return True


def closed(value):
    """Validate fixed SAFE schema and size; arbitrary input returns None."""
    try:
        template = Collector().summary()
        if type(value) is not dict or set(value) != set(template): return None
        constants = ('schema', 'mode', 'scope', 'profile', 'diagnosticOnly', 'executionAuthority', 'legacyContractAccepted',
            'end500Acceptance', 'productionAcceptance', 'hardLimitBytes', 'minimumHostReserveBytes', 'legacyPeakLimitBytes', 'legacyPeakScope',
            'kernelPeakOccurrenceTime', 'categoryOrder', 'phasePointColumns', 'seriesColumns',
            'peakCompositionKnown', 'snapshotAtomic', 'fileCacheAdditiveToPSS')
        if any(type(value[key]) is not type(template[key]) or value[key] != template[key] for key in constants): return None
        if not _number(value['sampleCount']) or not _valid_number(value['kernelLifetimePeakBytes']): return None
        if not (type(value['legacyPeakExceeded']) is bool or value['legacyPeakExceeded'] == UNKNOWN): return None
        for key in ('historyDecimated', 'kernelPeakMonotonic', 'observedTimeMonotonic', 'phaseSequenceMonotonic', 'anyCapacitySafetyFailureOrUnknown'):
            if type(value[key]) is not bool: return None
        if not _number(value['observedHistoryStride']) or value['observedHistoryStride'] < 1: return None
        if type(value['snapshots']) is not list or len(value['snapshots']) > len(CATEGORIES) + 5: return None
        if any(type(row) is not dict or not _valid_snapshot(row) for row in value['snapshots']): return None
        snapshots = {row['sampleNumber']: row for row in value['snapshots']}
        if len(snapshots) != len(value['snapshots']) or any(not 1 <= key <= value['sampleCount'] for key in snapshots): return None
        def valid_reference(row):
            return row == UNKNOWN or _number(row) and row in snapshots
        if any(not valid_reference(value[key]) for key in ('first', 'last', 'kernelPeakFirstObserved', 'maximumObservedCurrent', 'firstCapacitySafetyFailureOrUnknown')): return None
        if type(value['categoryMaxima']) is not dict or set(value['categoryMaxima']) != set(CATEGORIES): return None
        if any(not valid_reference(v) for v in value['categoryMaxima'].values()): return None
        if value['sampleCount'] == 0:
            if value['first'] != UNKNOWN or value['last'] != UNKNOWN or snapshots: return None
        elif value['first'] != 1 or value['last'] != value['sampleCount']: return None
        if value['kernelPeakFirstObserved'] == UNKNOWN:
            if value['kernelLifetimePeakBytes'] != UNKNOWN or value['legacyPeakExceeded'] != UNKNOWN: return None
        else:
            peak = snapshots[value['kernelPeakFirstObserved']]['kernelLifetimePeakBytes']
            if not _number(peak) or value['kernelLifetimePeakBytes'] != peak or value['legacyPeakExceeded'] != (peak > CAP.LEGACY_PEAK): return None
        if type(value['componentPSSMaxima']) is not dict or set(value['componentPSSMaxima']) != set(ROLES): return None
        for row in value['componentPSSMaxima'].values():
            if row == UNKNOWN: continue
            if (type(row) is not dict or set(row) != {'value', 'kind', 'sampleNumber', 'observedMonotonicNS', 'phaseSequence'}
                or not _number(row['value']) or not _number(row['sampleNumber']) or not 1 <= row['sampleNumber'] <= value['sampleCount']
                or row['kind'] not in ('COMPLETE', 'CONFIRMED_LOWER_BOUND')
                or not _valid_number(row['observedMonotonicNS'])
                or row['phaseSequence'] != UNKNOWN and (type(row['phaseSequence']) is not int or not 1 <= row['phaseSequence'] <= MAX_PHASES)): return None
        if (not _number(value['capacitySafetyFailureOrUnknownCount'])
            or not 0 <= value['capacitySafetyFailureOrUnknownCount'] <= value['sampleCount']
            or value['anyCapacitySafetyFailureOrUnknown'] != (value['capacitySafetyFailureOrUnknownCount'] > 0)): return None
        first_failure = value['firstCapacitySafetyFailureOrUnknown']
        if value['capacitySafetyFailureOrUnknownCount'] == 0:
            if first_failure != UNKNOWN: return None
        elif first_failure == UNKNOWN or snapshots[first_failure]['capacitySafetyObservation'] != 'FAIL_OR_UNKNOWN': return None
        if type(value['progress']) is not dict or set(value['progress']) != set(COUNTERS): return None
        for name, row in value['progress'].items():
            if row == UNKNOWN: continue
            if (type(row) is not dict or set(row) != {'value', 'kind', 'observedMonotonicNS', 'sampleNumber'}
                or _progress({name: {k: row[k] for k in ('value', 'kind')}})[name] == UNKNOWN
                or not _valid_number(row['observedMonotonicNS']) or not _number(row['sampleNumber'])
                or not 1 <= row['sampleNumber'] <= value['sampleCount']): return None
        phases = value['phaseObservations']
        if type(phases) is not list or len(phases) > MAX_PHASES: return None
        coverage = value['phaseCoverage']
        if (type(coverage) is not dict or set(coverage) != {'observed', 'included', 'complete'}
            or type(coverage['observed']) is not int or not len(phases) <= coverage['observed'] <= MAX_PHASES
            or type(coverage['included']) is not int or coverage['included'] != len(phases)
            or type(coverage['complete']) is not bool or coverage['complete'] != (len(phases) == coverage['observed'])): return None
        previous = 0
        for row in phases:
            if (type(row) is not dict or set(row) != {'phase', 'sampleCount', 'first', 'last', 'categoryMaxima'}
                or type(row['phase']) is not dict or _phase(row['phase']) != row['phase']
                or row['phase']['sequence'] <= previous or not _number(row['sampleCount']) or row['sampleCount'] < 1): return None
            previous = row['phase']['sequence']
            if any(type(row[k]) is not list or len(row[k]) != 3 or any(not _valid_number(x) for x in row[k]) for k in ('first', 'last')): return None
            if type(row['categoryMaxima']) is not list or len(row['categoryMaxima']) != len(CATEGORIES): return None
            if any(type(pair) is not list or len(pair) != 2 or any(not _valid_number(x) for x in pair) for pair in row['categoryMaxima']): return None
        rows = value['history']
        if type(rows) is not list or len(rows) > MAX_HISTORY: return None
        previous = 0
        for row in rows:
            core = len(SERIES_COLUMNS) - len(COUNTERS) * 2
            if (type(row) is not list or len(row) != len(SERIES_COLUMNS) or any(not _valid_number(x) for x in row[:core])
                or not _number(row[0]) or not previous < row[0] <= value['sampleCount']
                or row[2] != UNKNOWN and not 1 <= row[2] <= MAX_PHASES): return None
            previous = row[0]
            for offset, maximum in enumerate(COUNTERS.values()):
                number, kind = row[core + offset * 2:core + offset * 2 + 2]
                if number == UNKNOWN and kind == UNKNOWN: continue
                if not _number(number) or number > maximum or kind not in ('EXACT', 'CONFIRMED_LOWER_BOUND'): return None
        raw = _encode(value)
        if len(raw) > MAX_BYTES: return None
        return json.loads(raw)
    except Exception:
        return None
