"""Fixed full-restore capacity experiment, never a legacy RAM acceptance.

No import side effects. Read existing kernel counters in existing guard calls;
never evict cache, reset a peak, create an observer or choose an arbitrary cap.
"""
import sys
sys.dont_write_bytecode = True

import importlib.util
from functools import lru_cache
import json
import os
from pathlib import Path
import re
import time

MODE = 'end500-restore-capacity-diagnostic'
SCOPE = 'ISOLATED_GITHUB_FULL_RESTORE_CAPACITY_DIAGNOSTIC_ONLY'
HARD_LIMIT = 4999999488
HOST_RESERVE = 2 * 1024**3  # Explicit technical safety floor, not a vendor claim.
LEGACY_PEAK = 2048000000
LIMITS = {'comparisonBudgetBytes': HARD_LIMIT, 'maximumConsumptionBytes': HARD_LIMIT,
          'requiredReserveBytes': 0, 'swapBytes': 0}
CATEGORIES = ('anon', 'file', 'kernel', 'shmem', 'file_dirty', 'file_writeback')
SCHEMA = 'helmut-w15-full-restore-capacity-measurement/1'
UNKNOWN = 'UNKNOWN'


def need(value):
    if not value:
        raise ValueError('RESTORE_CAPACITY_DIAGNOSTIC_REJECTED')


@lru_cache(maxsize=4)
def load(name):
    spec = importlib.util.spec_from_file_location('w15_capacity_' + name, Path(__file__).with_name(name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def number(value):
    return type(value) is int and 0 <= value <= 2**53 - 1


def read(path):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        raw = os.read(fd, 8193)
        need(0 < len(raw) <= 8192)
        return raw.decode('ascii')
    finally:
        os.close(fd)


def pressure(raw):
    rows = {}
    for line in raw.splitlines():
        parts = line.split()
        need(len(parts) == 5 and parts[0] in ('some', 'full') and parts[0] not in rows)
        row = dict(item.split('=') for item in parts[1:])
        need(set(row) == {'avg10', 'avg60', 'avg300', 'total'})
        for key in ('avg10', 'avg60', 'avg300'):
            need(re.fullmatch(r'[0-9]{1,3}\.[0-9]{2}', row[key]) is not None)
            row[key] = int(row[key].replace('.', ''))  # hundredths of one percent
            need(0 <= row[key] <= 10000)
        need(re.fullmatch('[0-9]{1,16}', row['total']) is not None)
        row['total'] = int(row['total'])
        need(number(row['total']))
        rows[parts[0]] = row
    need(set(rows) == {'some', 'full'})
    return rows


def host_available():
    raw = read('/proc/meminfo')
    matches = re.findall(r'^MemAvailable: +([0-9]+) kB$', raw, re.MULTILINE)
    need(len(matches) == 1)
    amount = int(matches[0]) * 1024
    need(number(amount))
    root = Path('/sys/fs/cgroup')
    try:
        maximum = read(root / 'memory.max').strip()
    except FileNotFoundError:
        maximum = 'max'  # Only the root ancestor of the root-level slice.
    if maximum != 'max':
        current = read(root / 'memory.current').strip()
        need(maximum.isdigit() and current.isdigit())
        headroom = int(maximum) - int(current)
        need(number(headroom))
        amount = min(amount, headroom)
    return amount


def host_admission(*, meminfo=None, ancestor=None, psi=None):
    """Before creating the slice; actual host + its only (root) ancestor.

    The existing parent is created directly under the cgroup mount root. A
    missing root memory.max means the root has no such controller limit; any
    other unknown/invalid observation blocks. No child headroom is substituted.
    """
    page_bytes = os.sysconf('SC_PAGE_SIZE')
    need(type(page_bytes) is int and page_bytes == 4096 and HARD_LIMIT % page_bytes == 0
         and HARD_LIMIT <= 5000000000)
    raw = read('/proc/meminfo') if meminfo is None else meminfo
    values = {}
    for line in raw.splitlines():
        parts = line.split()
        if parts and parts[0] in ('MemTotal:', 'MemAvailable:'):
            need(len(parts) == 3 and parts[2] == 'kB' and parts[0] not in values
                 and parts[1].isdigit())
            values[parts[0]] = int(parts[1]) * 1024
    need(set(values) == {'MemTotal:', 'MemAvailable:'})
    need(0 <= values['MemAvailable:'] <= values['MemTotal:'] <= 2**53 - 1)
    if ancestor is None:
        root = Path('/sys/fs/cgroup')
        need((root / 'cgroup.controllers').is_file())
        try:
            maximum = read(root / 'memory.max').strip()
        except FileNotFoundError:
            maximum = 'ROOT_NO_MEMORY_MAX'
        current = read(root / 'memory.current').strip() if maximum not in ('max', 'ROOT_NO_MEMORY_MAX') else None
        ancestor = {'maximum': maximum, 'current': current}
    need(type(ancestor) is dict and set(ancestor) == {'maximum', 'current'})
    available = values['MemAvailable:']
    if ancestor['maximum'] in ('max', 'ROOT_NO_MEMORY_MAX'):
        need(ancestor['current'] is None)
        headroom = 'UNLIMITED_ROOT'
    else:
        need(type(ancestor['maximum']) is str and ancestor['maximum'].isdigit()
             and type(ancestor['current']) is str and ancestor['current'].isdigit())
        headroom = int(ancestor['maximum']) - int(ancestor['current'])
        need(number(headroom))
        available = min(available, headroom)
    observed_pressure = pressure(read('/proc/pressure/memory') if psi is None else psi)
    need(available >= HARD_LIMIT + HOST_RESERVE)
    return {'kernelPageBytes': page_bytes, 'status': 'PASS_ACTUAL_HOST_CAPACITY_ADMISSION_ONLY', 'hostTotalBytes': values['MemTotal:'],
            'hostAvailableBytes': values['MemAvailable:'], 'ancestorHeadroomBytes': headroom,
            'effectiveAvailableBytes': available, 'diagnosticHardLimitBytes': HARD_LIMIT,
            'minimumUnallocatedHostReserveBytes': HOST_RESERVE,
            'availableBeyondDiagnosticHardLimitBytes': available - HARD_LIMIT,
            'hostMemoryPressure': observed_pressure, 'executionAuthority': False}


def assess(sample):
    need(type(sample) is dict and sample.get('configuredLimit') == str(HARD_LIMIT)
         and sample.get('swapMaximum') == '0'
         and type(sample.get('swapCurrentBytes')) is int and sample['swapCurrentBytes'] == 0)
    need(all(type(sample.get(k)) is int and 0 <= sample[k] <= HARD_LIMIT
             for k in ('kernelLifetimePeakBytes', 'currentBytes')))
    need(type(sample.get('events')) is dict and all(type(sample['events'].get(k)) is int
         and sample['events'][k] == 0 for k in ('max', 'oom', 'oom_kill', 'oom_group_kill')))
    detail = sample.get('capacityMeasurement')
    if detail is not None:
        need(closed(detail) is not None and type(detail['last']['hostAvailableBytes']) is int
             and detail['last']['hostAvailableBytes'] >= HOST_RESERVE)
    return sample  # LEGACY_PEAK is intentionally not an admission threshold here.


def capture(fd):
    def at(name):
        child = os.open(name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=fd)
        try:
            raw = os.read(child, 8193)
            need(0 < len(raw) <= 8192)
            return raw.decode('ascii')
        finally:
            os.close(child)
    categories = dict.fromkeys(CATEGORIES, UNKNOWN)
    seen = set()
    try:
        for line in at('memory.stat').splitlines():
            parts = line.split()
            if parts and parts[0] in CATEGORIES:
                need(len(parts) == 2 and parts[0] not in seen and parts[1].isdigit())
                value = int(parts[1]); need(number(value))
                categories[parts[0]] = value; seen.add(parts[0])
    except Exception:
        categories = dict.fromkeys(CATEGORIES, UNKNOWN)
    try:
        psi = pressure(at('memory.pressure'))
    except Exception:
        psi = UNKNOWN
    try:
        available = host_available()
    except Exception:
        available = UNKNOWN
    return {'hostAvailableBytes': available, 'memoryStat': categories, 'memoryPressure': psi, 'observedMonotonicNS': time.monotonic_ns(),
            'peakCompositionKnown': False}


def closed(value):
    """Closed bounded public summary; no paths, PID names, logs or free text."""
    try:
        keys = {'schema', 'diagnosticOnly', 'legacyPeakLimitBytes', 'legacyPeakExceeded',
                'legacyContractAccepted', 'sampleCount', 'maximumObservedCurrentBytes',
                'categoryMaxima', 'last', 'phaseObservations'}
        need(type(value) is dict and set(value) == keys and value['schema'] == SCHEMA
             and value['diagnosticOnly'] is True and value['legacyContractAccepted'] is False
             and value['legacyPeakLimitBytes'] == LEGACY_PEAK and type(value['legacyPeakExceeded']) is bool
             and type(value['sampleCount']) is int and 1 <= value['sampleCount'] <= 2**53 - 1
             and number(value['maximumObservedCurrentBytes']))
        last = value['last']
        need(type(last) is dict and set(last) == {'hostAvailableBytes', 'memoryStat', 'memoryPressure', 'observedMonotonicNS', 'peakCompositionKnown'}
             and number(last['observedMonotonicNS']) and last['peakCompositionKnown'] is False
             and (number(last['hostAvailableBytes']) or last['hostAvailableBytes'] == UNKNOWN))
        for row in (last['memoryStat'], value['categoryMaxima']):
            need(type(row) is dict and set(row) == set(CATEGORIES)
                 and all(number(v) or v == UNKNOWN for v in row.values()))
        psi = last['memoryPressure']
        if psi != UNKNOWN:
            need(type(psi) is dict and set(psi) == {'some', 'full'})
            for row in psi.values():
                need(type(row) is dict and set(row) == {'avg10', 'avg60', 'avg300', 'total'}
                     and number(row['total']) and all(type(row[k]) is int and 0 <= row[k] <= 10000
                                                      for k in ('avg10', 'avg60', 'avg300')))
        rows = value['phaseObservations']
        need(type(rows) is list and len(rows) <= 128)
        previous = 0
        phases = load('runner_diagnostics')
        for row in rows:
            need(type(row) is dict and set(row) == {'name', 'sequence', 'meaning', 'observedKernelPeakBytes', 'observedCurrentBytes'}
                 and phases.phase_observation({k: row[k] for k in ('name', 'sequence', 'meaning')}) is not None
                 and previous < row['sequence'] <= 128 and number(row['observedKernelPeakBytes'])
                 and number(row['observedCurrentBytes']))
            previous = row['sequence']
        need(len(json.dumps(value, separators=(',', ':'), allow_nan=False)) <= 32768)
        return json.loads(json.dumps(value, allow_nan=False))
    except Exception:
        return None


def snapshot(sample, fd):
    last = capture(fd)
    return {'schema': SCHEMA, 'diagnosticOnly': True, 'legacyPeakLimitBytes': LEGACY_PEAK,
            'legacyPeakExceeded': sample['kernelLifetimePeakBytes'] > LEGACY_PEAK,
            'legacyContractAccepted': False, 'sampleCount': 1,
            'maximumObservedCurrentBytes': sample['currentBytes'], 'categoryMaxima': dict(last['memoryStat']),
            'last': last, 'phaseObservations': []}


def merge(previous, current, sample, phase=None):
    need(closed(current) is not None)
    if previous is None:
        result = json.loads(json.dumps(current))
    else:
        need(closed(previous) is not None)
        result = json.loads(json.dumps(previous))
        result['sampleCount'] += current['sampleCount']
        result['legacyPeakExceeded'] |= current['legacyPeakExceeded']
        result['maximumObservedCurrentBytes'] = max(result['maximumObservedCurrentBytes'], current['maximumObservedCurrentBytes'])
        for key in CATEGORIES:
            amounts = [x for x in (previous['categoryMaxima'][key], current['categoryMaxima'][key]) if number(x)]
            result['categoryMaxima'][key] = max(amounts) if amounts else UNKNOWN
        result['last'] = current['last']
        if current['phaseObservations']:
            result['phaseObservations'] = current['phaseObservations']
    if phase and load('runner_diagnostics').phase_observation(phase) is not None and phase != UNKNOWN:
        rows = result['phaseObservations']
        if not rows or phase['sequence'] > rows[-1]['sequence']:
            rows.append({**phase, 'observedKernelPeakBytes': sample['kernelLifetimePeakBytes'],
                         'observedCurrentBytes': sample['currentBytes']})
    need(closed(result) is not None)
    return result


if __name__ == '__main__':
    try:
        need(sys.argv[1:] == ['--host-admission'])
        print(json.dumps(host_admission(), sort_keys=True))
    except BaseException:
        print('{"status":"BLOCKED_ACTUAL_HOST_CAPACITY_UNPROVEN","executionAuthority":false}')
        sys.exit(1)
