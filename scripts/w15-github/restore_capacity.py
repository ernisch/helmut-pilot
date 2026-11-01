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
HOST_MODE = 'end500-full-host-capacity-diagnostic'
HOST_SCOPE = 'ISOLATED_GITHUB_END500_HOST_CAPACITY_DIAGNOSTIC_ONLY'
HOST_PROFILE = 'helmut-w15-end500-host-capacity-diagnostic/1'
HOST_POLICY = {'minimumHostReserveBytes': HOST_RESERVE, 'swapBytes': 0}
HOST_ADMISSION_SCHEMA = 'helmut-w15-dynamic-host-capacity-admission/1'
HOST_OBSERVATION_SCHEMA = 'helmut-w15-host-capacity-reserve-observation/1'


def _host_path(value):
    need(type(value) is str and 0 < len(value) <= 2048 and value.startswith('/')
         and all(33 <= ord(c) <= 126 for c in value)
         and '..' not in Path(value).parts and '.' not in value.split('/')
         and str(Path(value)) == value)
    return value


def _host_raw(path, maximum=131072):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        raw = os.read(fd, maximum + 1)
        need(0 < len(raw) <= maximum)
        return raw.decode('ascii')
    finally:
        os.close(fd)


def _host_identity(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        st = os.fstat(fd)
        return [st.st_dev, st.st_ino]
    finally:
        os.close(fd)


def _host_meminfo():
    values = {}
    for line in _host_raw('/proc/meminfo').splitlines():
        row = line.split()
        if row and row[0] in ('MemTotal:', 'MemAvailable:'):
            need(len(row) == 3 and row[2] == 'kB' and row[0] not in values and row[1].isdigit())
            values[row[0]] = int(row[1]) * 1024
    need(set(values) == {'MemTotal:', 'MemAvailable:'}
         and 0 <= values['MemAvailable:'] <= values['MemTotal:'] <= 2**53 - 1)
    return values['MemTotal:'], values['MemAvailable:']


def _host_root_proof():
    root = Path('/sys/fs/cgroup')
    mounts = [line.split() for line in _host_raw('/proc/self/mountinfo').splitlines()
              if ' - cgroup2 ' in line and len(line.split()) > 6
              and line.split()[4] == str(root)]
    need(len(mounts) == 1 and mounts[0][3] == '/')
    need('memory' in _host_raw(root/'cgroup.controllers', 8192).split())
    try:
        _host_raw(root/'memory.max', 64)
    except FileNotFoundError:
        pass  # The real cgroup2 hierarchy root has no memory.max interface.
    else:
        raise ValueError('HOST_CAPACITY_HIERARCHY_UNKNOWN')
    return _host_identity(root)


def _host_ancestor(relative):
    _host_path(relative)
    root = Path('/sys/fs/cgroup')
    path = root/relative.lstrip('/')
    identity = _host_identity(path)
    if relative == '/':
        return dict(relativePath=relative, identity=identity,
                    maximumBytes='UNLIMITED_ROOT', currentBytes='NOT_APPLICABLE',
                    headroomBytes='UNLIMITED_ROOT')
    maximum = _host_raw(path/'memory.max', 64).strip()
    current = _host_raw(path/'memory.current', 64).strip()
    need(current.isdigit() and number(int(current)))
    if maximum == 'max':
        return dict(relativePath=relative, identity=identity,
                    maximumBytes='UNLIMITED', currentBytes=int(current), headroomBytes='UNLIMITED')
    need(maximum.isdigit() and number(int(maximum)) and int(maximum) >= int(current))
    return dict(relativePath=relative, identity=identity, maximumBytes=int(maximum),
                currentBytes=int(current), headroomBytes=int(maximum)-int(current))


def host_admission_dynamic(*, observation=None):
    """Read-only, one-time capacity selection; caller inputs cannot set a cap.

    The test parent is a direct child of the proven kernel hierarchy root. The
    original caller's additional limits are retained as conservative allocation
    constraints even though that caller is outside the subsequent test parent.
    """
    if observation is None:
        root_identity = _host_root_proof()
        rows = _host_raw('/proc/self/cgroup', 8192).splitlines()
        need(len(rows) == 1 and rows[0].startswith('0::'))
        caller = _host_path(rows[0][3:])
        paths = [str(p) for p in (Path(caller), *Path(caller).parents)]
        need(1 <= len(paths) <= 64 and paths[-1] == '/')
        total, available = _host_meminfo()
        observation = dict(hostTotalBytes=total, hostAvailableBytes=available,
            hierarchyRootIdentity=root_identity, callerRelativePath=caller,
            ancestors=[_host_ancestor(p) for p in paths], observedMonotonicNS=time.monotonic_ns())
    need(type(observation) is dict)
    value = dict(observation, schema=HOST_ADMISSION_SCHEMA, profile=HOST_PROFILE,
        kernelPageBytes=os.sysconf('SC_PAGE_SIZE'),
        minimumUnallocatedHostReserveBytes=HOST_RESERVE,
        parentPlacement='DIRECT_HIERARCHY_ROOT', executionAuthority=False)
    finite = [r['headroomBytes'] for r in value['ancestors'] if type(r.get('headroomBytes')) is int]
    value['effectiveAvailableBytes'] = min([value['hostAvailableBytes'], *finite])
    value['diagnosticHardLimitBytes'] = ((value['effectiveAvailableBytes']-HOST_RESERVE)//4096)*4096
    need(host_closed_admission(value) is not None)
    return value


def host_caller_provenance(admission=None):
    """Identity/limit provenance, never another selected or activated cap."""
    if admission is None:
        root = _host_root_proof()
        rows = _host_raw('/proc/self/cgroup',8192).splitlines()
        need(len(rows) == 1 and rows[0].startswith('0::'))
        caller = _host_path(rows[0][3:])
        ancestors = [_host_ancestor(str(p)) for p in (Path(caller),*Path(caller).parents)]
    else:
        need(host_closed_admission(admission) is not None)
        root,caller,ancestors = admission['hierarchyRootIdentity'],admission['callerRelativePath'],admission['ancestors']
    return {'rootIdentity':root,'callerRelativePath':caller,
            'ancestorIdentityLimits':[{k:r[k] for k in ('relativePath','identity','maximumBytes')} for r in ancestors]}


def host_closed_admission(value):
    try:
        keys = {'schema','profile','kernelPageBytes','hostTotalBytes','hostAvailableBytes',
            'hierarchyRootIdentity','callerRelativePath','ancestors','observedMonotonicNS',
            'minimumUnallocatedHostReserveBytes','parentPlacement','executionAuthority',
            'effectiveAvailableBytes','diagnosticHardLimitBytes'}
        need(type(value) is dict and set(value) == keys and value['schema'] == HOST_ADMISSION_SCHEMA
             and value['profile'] == HOST_PROFILE and value['kernelPageBytes'] == 4096
             and value['minimumUnallocatedHostReserveBytes'] == HOST_RESERVE
             and value['parentPlacement'] == 'DIRECT_HIERARCHY_ROOT' and value['executionAuthority'] is False)
        need(len(json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=True).encode('ascii')) <= 32768)
        for k in ('hostTotalBytes','hostAvailableBytes','observedMonotonicNS','effectiveAvailableBytes','diagnosticHardLimitBytes'):
            need(number(value[k]))
        need(0 < value['diagnosticHardLimitBytes'] and value['hostAvailableBytes'] <= value['hostTotalBytes'])
        _host_path(value['callerRelativePath'])
        expected_paths = [str(p) for p in (Path(value['callerRelativePath']), *Path(value['callerRelativePath']).parents)]
        rows = value['ancestors']
        need(type(rows) is list and 1 <= len(rows) <= 64
             and [r['relativePath'] for r in rows] == expected_paths)
        seen = set(); finite = []
        for row in rows:
            need(type(row) is dict and set(row) == {'relativePath','identity','maximumBytes','currentBytes','headroomBytes'})
            _host_path(row['relativePath']); identity = row['identity']
            need(type(identity) is list and len(identity) == 2 and all(number(x) for x in identity)
                 and tuple(identity) not in seen)
            seen.add(tuple(identity))
            if row['relativePath'] == '/':
                need(identity == value['hierarchyRootIdentity']
                     and row['maximumBytes'] == row['headroomBytes'] == 'UNLIMITED_ROOT'
                     and row['currentBytes'] == 'NOT_APPLICABLE')
            elif row['maximumBytes'] == 'UNLIMITED':
                need(number(row['currentBytes']) and row['headroomBytes'] == 'UNLIMITED')
            else:
                need(number(row['maximumBytes']) and number(row['currentBytes'])
                     and row['maximumBytes'] >= row['currentBytes']
                     and row['headroomBytes'] == row['maximumBytes']-row['currentBytes'])
                finite.append(row['headroomBytes'])
        effective = min([value['hostAvailableBytes'], *finite])
        need(value['effectiveAvailableBytes'] == effective
             and value['diagnosticHardLimitBytes'] == ((effective-HOST_RESERVE)//4096)*4096)
        return json.loads(json.dumps(value))
    except Exception:
        return None


def host_budget(admission):
    need(host_closed_admission(admission) is not None)
    return dict(schema='helmut-w15-host-capacity-budget/1', profile=HOST_PROFILE,
                hardLimitBytes=admission['diagnosticHardLimitBytes'], minimumHostReserveBytes=HOST_RESERVE)


def host_public_admission(admission):
    need(host_closed_admission(admission) is not None)
    return {k: admission[k] for k in ('schema','profile','kernelPageBytes','hostTotalBytes',
        'hostAvailableBytes','effectiveAvailableBytes','diagnosticHardLimitBytes',
        'minimumUnallocatedHostReserveBytes','observedMonotonicNS','parentPlacement','executionAuthority')} | {
        'hierarchyRootProven': True, 'originalCallerConstraintsRetained': True,
        'ancestorLimits': [{k:r[k] for k in ('maximumBytes','currentBytes','headroomBytes')} for r in admission['ancestors']]}


def host_closed_observation(value):
    try:
        need(type(value) is dict and set(value) == {'schema','status','hostAvailableBytes',
            'minimumAncestorHeadroomBytes','requiredAncestorHeadroomBytes','minimumHostReserveBytes',
            'observedMonotonicNS','ancestorIdentitiesMatch'} and value['schema'] == HOST_OBSERVATION_SCHEMA
            and value['status'] in ('PASS','FAIL_HOST_RESERVE','FAIL_ANCESTOR_HEADROOM','UNKNOWN')
            and value['minimumHostReserveBytes'] == HOST_RESERVE
            and number(value['requiredAncestorHeadroomBytes']) and number(value['observedMonotonicNS'])
            and type(value['ancestorIdentitiesMatch']) is bool
            and (number(value['hostAvailableBytes']) or value['hostAvailableBytes'] == UNKNOWN)
            and (number(value['minimumAncestorHeadroomBytes']) or value['minimumAncestorHeadroomBytes'] in ('UNLIMITED',UNKNOWN)))
        return json.loads(json.dumps(value))
    except Exception:
        return None


def host_runtime_guard(admission):
    need(host_closed_admission(admission) is not None)
    value = dict(schema=HOST_OBSERVATION_SCHEMA, status=UNKNOWN, hostAvailableBytes=UNKNOWN,
        minimumAncestorHeadroomBytes=UNKNOWN,
        requiredAncestorHeadroomBytes=admission['diagnosticHardLimitBytes']+HOST_RESERVE,
        minimumHostReserveBytes=HOST_RESERVE, observedMonotonicNS=time.monotonic_ns(), ancestorIdentitiesMatch=False)
    try:
        need(_host_root_proof() == admission['hierarchyRootIdentity'])
        _, value['hostAvailableBytes'] = _host_meminfo()
        finite = []
        for old in admission['ancestors']:
            now = _host_ancestor(old['relativePath'])
            need(now['identity'] == old['identity'] and now['maximumBytes'] == old['maximumBytes'])
            if type(now['headroomBytes']) is int:finite.append(now['headroomBytes'])
        value['ancestorIdentitiesMatch'] = True
        value['minimumAncestorHeadroomBytes'] = min(finite) if finite else 'UNLIMITED'
        value['status'] = ('FAIL_HOST_RESERVE' if value['hostAvailableBytes'] < HOST_RESERVE else
            'FAIL_ANCESTOR_HEADROOM' if finite and min(finite) < value['requiredAncestorHeadroomBytes'] else 'PASS')
    except Exception:
        value['status'] = UNKNOWN
    need(host_closed_observation(value) is not None)
    return value


def host_assess(sample, admission):
    budget = host_budget(admission); limit = budget['hardLimitBytes']
    need(type(sample) is dict and sample.get('configuredLimit') == str(limit)
         and sample.get('swapMaximum') == '0' and type(sample.get('swapCurrentBytes')) is int and sample['swapCurrentBytes'] == 0
         and sample.get('hostCapacityBudget') == budget)
    need(all(type(sample.get(k)) is int and 0 <= sample[k] <= limit for k in ('kernelLifetimePeakBytes','currentBytes')))
    need(type(sample.get('events')) is dict and all(type(sample['events'].get(k)) is int and sample['events'][k] == 0
         for k in ('max','oom','oom_kill','oom_group_kill')))
    observed = host_closed_observation(sample.get('hostCapacityObservation'))
    need(observed is not None and observed['status'] == 'PASS' and observed['ancestorIdentitiesMatch'] is True
         and type(observed['hostAvailableBytes']) is int and observed['hostAvailableBytes'] >= HOST_RESERVE
         and observed['requiredAncestorHeadroomBytes'] == limit+HOST_RESERVE
         and (observed['minimumAncestorHeadroomBytes'] == 'UNLIMITED'
              or type(observed['minimumAncestorHeadroomBytes']) is int
              and observed['minimumAncestorHeadroomBytes'] >= limit+HOST_RESERVE))
    if sample.get('capacityMeasurement') is not None:
        detail = closed(sample['capacityMeasurement'])
        need(detail is not None and type(detail['last']['hostAvailableBytes']) is int
             and detail['last']['hostAvailableBytes'] >= HOST_RESERVE)
    return sample


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
        need(sys.argv[1:] in (['--host-admission'], ['--host-capacity-probe-only'], ['--host-caller-provenance-only']))
        if sys.argv[1:] == ['--host-capacity-probe-only']:
            import subprocess
            before = host_caller_provenance()
            child = subprocess.run(['/usr/bin/sudo','-n','/usr/bin/python3','-B',str(Path(__file__).absolute()),
                                    '--host-caller-provenance-only'],stdin=subprocess.DEVNULL,
                                   stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=15,close_fds=True)
            need(child.returncode == 0 and 0 < len(child.stdout) <= 32768 and json.loads(child.stdout) == before)
            print(json.dumps({'status':'PASS_READ_ONLY_HOST_CAPACITY_PROBE_NO_ORIGINALS',
                'hostCapacityAdmission':host_public_admission(host_admission_dynamic()),
                'privilegedCallerProvenanceMatched':True,
                'originalDataRead':False,'limitActivated':False,'executionAuthority':False},sort_keys=True))
        elif sys.argv[1:] == ['--host-caller-provenance-only']:
            need(os.getuid() == 0)
            print(json.dumps(host_caller_provenance(),sort_keys=True))
        else:
            print(json.dumps(host_admission(), sort_keys=True))
    except BaseException:
        print('{"status":"BLOCKED_ACTUAL_HOST_CAPACITY_UNPROVEN","executionAuthority":false}')
        sys.exit(1)
