"""Observe an existing fresh common cgroup; never create or change resources.

The explicit parent must contain the Python orchestrator and every container
child. A container-only peak is rejected. Keep this same kernel lifetime for
input materialization, work, native audit and backup closure; never reset it.
"""
import sys
sys.dont_write_bytecode = True

import json
import importlib.util
import os
from pathlib import Path
import re
import stat
import uuid

LIMIT, MAXIMUM, RESERVE = 2560000000, 2048000000, 512000000
KERNEL_ROOT = Path('/sys/fs/cgroup')
TOKEN = object()
MEMORY_STAT_FIELDS = ('anon', 'file', 'kernel', 'shmem', 'file_dirty', 'file_writeback')
HOST_PROFILE = 'helmut-w15-end500-host-capacity-diagnostic/1'
HOST_BUDGET_SCHEMA = 'helmut-w15-host-capacity-budget/1'


_CAPACITY = None
_PHASE_CONTRACT = None
_END_TRACE = None
_FUNCTIONAL_CONTRACT = None


def functional_contract():
    global _FUNCTIONAL_CONTRACT
    if _FUNCTIONAL_CONTRACT is None:
        spec = importlib.util.spec_from_file_location('w15_common_functional', Path(__file__).with_name('functional_contract.py'))
        _FUNCTIONAL_CONTRACT = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(_FUNCTIONAL_CONTRACT)
    return _FUNCTIONAL_CONTRACT


def end_capacity_trace():
    global _END_TRACE
    if _END_TRACE is None:
        spec = importlib.util.spec_from_file_location('w15_common_end_trace', Path(__file__).with_name('end500_capacity_trace.py'))
        _END_TRACE = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(_END_TRACE)
    return _END_TRACE


def phase_contract():
    global _PHASE_CONTRACT
    if _PHASE_CONTRACT is None:
        spec = importlib.util.spec_from_file_location('w15_common_phases', Path(__file__).with_name('phase_contract.py'))
        _PHASE_CONTRACT = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(_PHASE_CONTRACT)
    return _PHASE_CONTRACT


def phase_context(context):
    return {key: context[key] for key in ('exactCommit', 'runId', 'runAttempt', 'nonce')}


def capacity():
    global _CAPACITY
    if _CAPACITY is None:
        spec = importlib.util.spec_from_file_location('w15_common_capacity', Path(__file__).with_name('restore_capacity.py'))
        _CAPACITY = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(_CAPACITY)
    return _CAPACITY


def closed_host_capacity_budget(value):
    """Public numeric reference only, never permission to select a limit."""
    if (type(value) is not dict or set(value) != {
            'schema', 'profile', 'hardLimitBytes', 'minimumHostReserveBytes'}
            or value['schema'] != HOST_BUDGET_SCHEMA or value['profile'] != HOST_PROFILE
            or type(value['hardLimitBytes']) is not int
            or not 0 < value['hardLimitBytes'] <= 2**53 - 1 - capacity().HOST_RESERVE
            or value['hardLimitBytes'] % 4096 != 0
            or type(value['minimumHostReserveBytes']) is not int
            or value['minimumHostReserveBytes'] != capacity().HOST_RESERVE):
        return None
    return dict(value)


def host_capacity_budget(admission):
    checked = capacity().host_closed_admission(admission)
    require(checked is not None)
    value = closed_host_capacity_budget({'schema': HOST_BUDGET_SCHEMA, 'profile': HOST_PROFILE,
        'hardLimitBytes': checked['diagnosticHardLimitBytes'],
        'minimumHostReserveBytes': capacity().HOST_RESERVE})
    require(value is not None)
    return value


def closed_host_capacity_observation(value, budget):
    observed = capacity().host_closed_observation(value)
    if (observed is None
            or observed['requiredAncestorHeadroomBytes'] != budget['hardLimitBytes'] + budget['minimumHostReserveBytes']):
        return None
    if observed['status'] == 'PASS' and (observed['ancestorIdentitiesMatch'] is not True
            or type(observed['hostAvailableBytes']) is not int
            or observed['hostAvailableBytes'] < budget['minimumHostReserveBytes']
            or observed['minimumAncestorHeadroomBytes'] != 'UNLIMITED'
               and (type(observed['minimumAncestorHeadroomBytes']) is not int
                    or observed['minimumAncestorHeadroomBytes'] < observed['requiredAncestorHeadroomBytes'])):
        return None
    return observed


class ResourceError(RuntimeError):
    pass


def require(value):
    if not value:
        raise ResourceError('COMMON_TEST_RESOURCE_BINDING_REJECTED')


def membership(raw):
    rows = raw.strip().splitlines()
    require(len(rows) == 1 and rows[0].startswith('0::/'))
    value = rows[0][3:]
    require(all(p not in ('', '.', '..') for p in value.split('/')[1:]))
    return value


def assess(sample):
    require(isinstance(sample, dict)
            and sample.get('configuredLimit') == str(LIMIT) and sample.get('swapMaximum') == '0')
    require(all(type(sample.get(k)) is int and 0 <= sample[k] <= MAXIMUM
                for k in ('kernelLifetimePeakBytes', 'currentBytes'))
            and type(sample.get('swapCurrentBytes')) is int and sample['swapCurrentBytes'] == 0)
    events = sample.get('events')
    require(isinstance(events, dict) and all(type(events.get(k)) is int and events[k] == 0
            for k in ('max', 'oom', 'oom_kill', 'oom_group_kill')))
    require(LIMIT - sample['kernelLifetimePeakBytes'] >= RESERVE)
    return sample


def closed_failure_memory(value):
    """Closed numeric diagnostics only; never a resource acceptance."""
    keys = {'configuredLimitBytes', 'kernelLifetimePeakBytes', 'currentBytes',
            'swapMaximumBytes', 'swapCurrentBytes', 'lastReadbackValid', 'events'}
    events = ('max', 'oom', 'oom_kill', 'oom_group_kill')
    if (type(value) is not dict or not keys <= set(value) <= keys | {
            'postFailureMemoryStat', 'capacityMeasurement', 'end500CapacityTrace',
            'hostCapacityBudget', 'hostCapacitySafetyObserved', 'hostCapacityObservation'}
            or type(value['lastReadbackValid']) is not bool):
        return None
    if any(type(value[k]) is not int or not 0 <= value[k] <= 2**53 - 1
           for k in keys - {'lastReadbackValid', 'events'}):
        return None
    if type(value['events']) is not dict or set(value['events']) != set(events) or any(
            type(value['events'][k]) is not int or not 0 <= value['events'][k] <= 2**53 - 1 for k in events):
        return None
    result = {key: value[key] for key in keys}
    host = closed_host_capacity_budget(value.get('hostCapacityBudget'))
    if host is not None and host['hardLimitBytes'] != value['configuredLimitBytes']:
        host = None
    if host is not None:
        result['hostCapacityBudget'] = host
        observed = closed_host_capacity_observation(value.get('hostCapacityObservation'), host)
        if observed is not None:
            result['hostCapacityObservation'] = observed
        if (value.get('hostCapacitySafetyObserved') is False
                or value.get('hostCapacitySafetyObserved') is True and observed is not None and observed['status'] == 'PASS'):
            result['hostCapacitySafetyObserved'] = value['hostCapacitySafetyObserved']
    if 'postFailureMemoryStat' in value and value['lastReadbackValid'] is False:
        detail = closed_post_failure_memory_stat(value['postFailureMemoryStat'])
        if detail is not None:
            result['postFailureMemoryStat'] = detail
    if 'capacityMeasurement' in value and (host is not None and host['hardLimitBytes'] == value['configuredLimitBytes']
                                         or value['configuredLimitBytes'] == capacity().HARD_LIMIT):
        detail = capacity().closed(value['capacityMeasurement'])
        if detail is not None:
            result['capacityMeasurement'] = detail
    # Optional malformed details cannot erase an already known first sample.
    if 'end500CapacityTrace' in value and (host is not None and host['hardLimitBytes'] == value['configuredLimitBytes']
                                         or value['configuredLimitBytes'] == capacity().HARD_LIMIT):
        trace = end_capacity_trace().closed(value['end500CapacityTrace'],
            **({'host_capacity_budget': host} if host is not None else {}))
        if trace is not None:
            result['end500CapacityTrace'] = trace
    return json.loads(json.dumps(result))


def closed_post_failure_memory_stat(value):
    """Numeric categories observed after rejection, never a peak breakdown."""
    keys = set(MEMORY_STAT_FIELDS) | {'observedAfterFailure', 'peakCompositionKnown'}
    if (type(value) is not dict or set(value) != keys or value['observedAfterFailure'] is not True
            or value['peakCompositionKnown'] is not False):
        return None
    if any(not (type(value[key]) is int and 0 <= value[key] <= 2**53 - 1
                or type(value[key]) is str and value[key] == 'UNKNOWN') for key in MEMORY_STAT_FIELDS):
        return None
    return json.loads(json.dumps(value))


def capture_post_failure_memory_stat(parent_fd):
    """Failure-only best effort on the already identity-checked open parent.

    Never replace the first failure, sample peak/current again, or treat absent
    categories as zero. The later category counters do not explain a past peak.
    """
    unknown = {**dict.fromkeys(MEMORY_STAT_FIELDS, 'UNKNOWN'),
               'observedAfterFailure': True, 'peakCompositionKnown': False}
    child = None
    try:
        child = os.open('memory.stat', os.O_RDONLY | os.O_NOFOLLOW, dir_fd=parent_fd)
        raw = os.read(child, 8193)
        if not 0 < len(raw) <= 8192:
            return unknown
        value, seen = dict(unknown), set()
        for line in raw.decode('ascii').splitlines():
            parts = line.split()
            if parts and parts[0] in MEMORY_STAT_FIELDS:
                if (len(parts) != 2 or parts[0] in seen or re.fullmatch('[0-9]{1,16}', parts[1]) is None
                        or int(parts[1]) > 2**53 - 1):
                    return unknown
                seen.add(parts[0])
                value[parts[0]] = int(parts[1])
        return closed_post_failure_memory_stat(value) or unknown
    except BaseException:
        return unknown
    finally:
        if child is not None:
            try:
                os.close(child)
            except BaseException:
                pass  # A diagnostic close cannot displace the first failure.


def project_failure_memory(value, valid):
    """Project an already captured sample, including a rejected one; no IO."""
    if type(value) is not dict or type(valid) is not bool:
        return None
    try:
        for key in ('configuredLimit', 'swapMaximum'):
            if type(value[key]) is not str or re.fullmatch('[0-9]{1,16}', value[key]) is None:
                return None
        result = {key: value[key] for key in ('kernelLifetimePeakBytes', 'currentBytes', 'swapCurrentBytes')}
        result.update(configuredLimitBytes=int(value['configuredLimit']), swapMaximumBytes=int(value['swapMaximum']),
            lastReadbackValid=valid,
            events={key: value['events'][key] for key in ('max', 'oom', 'oom_kill', 'oom_group_kill')})
        if 'postFailureMemoryStat' in value:
            result['postFailureMemoryStat'] = value['postFailureMemoryStat']
        if 'capacityMeasurement' in value:
            result['capacityMeasurement'] = value['capacityMeasurement']
        if 'end500CapacityTrace' in value:
            result['end500CapacityTrace'] = value['end500CapacityTrace']
        for key in ('hostCapacityBudget', 'hostCapacitySafetyObserved', 'hostCapacityObservation'):
            if key in value:
                result[key] = value[key]
        return closed_failure_memory(result)
    except (KeyError, TypeError, ValueError):
        return None


class CommonResources:
    def __init__(self, token, context, path, identity, *, capacity_diagnostic=False, processing_backup_stage=None, end_capacity_diagnostic=False, functional_stage=None, host_capacity_admission=None):
        require(token is TOKEN)
        self._context = json.loads(json.dumps(context))
        self.path, self._identity = path, identity
        self._last_observed, self._last_valid = None, False
        require(type(capacity_diagnostic) is bool and type(end_capacity_diagnostic) is bool)
        self.host_capacity_admission = None
        self.host_capacity_budget = None
        if host_capacity_admission is not None:
            require(processing_backup_stage is None and functional_stage is None)
            self.host_capacity_admission = capacity().host_closed_admission(host_capacity_admission)
            require(self.host_capacity_admission is not None)
            self.host_capacity_budget = host_capacity_budget(self.host_capacity_admission)
            capacity_diagnostic, end_capacity_diagnostic = True, True
        self.capacity_diagnostic = capacity_diagnostic
        require(type(end_capacity_diagnostic) is bool and (not end_capacity_diagnostic or capacity_diagnostic))
        self.end_capacity_diagnostic = end_capacity_diagnostic
        self.capacity_observer = None
        self.container_limit = capacity().HARD_LIMIT if capacity_diagnostic else LIMIT
        if self.host_capacity_admission is not None:
            self.profile = HOST_PROFILE
            self.container_limit = self.host_capacity_budget['hardLimitBytes']
        require(processing_backup_stage in (None, 'end500', 'mock500')
                and not (capacity_diagnostic and processing_backup_stage is not None))
        self.processing_backup_stage = processing_backup_stage
        require(functional_stage in (None, 'end500', 'mock500')
                and not (functional_stage is not None and (capacity_diagnostic or processing_backup_stage is not None)))
        self.functional_stage = functional_stage
        self._functional_kernel, self._functional_first_kernel = 'UNKNOWN', 'UNKNOWN'
        self._functional_samples, self._functional_component_maxima = 0, {}
        if functional_stage is not None:
            self.profile = functional_contract().profile(functional_stage)
            self.container_limit = functional_contract().HARD_LIMIT
        self.memory_phase, self.backup_ack, self.backup_transition = 'processing', None, None
        self._phase_state, self._transition_attempted = None, False
        if processing_backup_stage is not None:
            self.container_limit = phase_contract().processing_limits(processing_backup_stage)['comparisonBudgetBytes']
            self._phase_state = phase_contract().OneWayState(processing_backup_stage, phase_context(context),
                parent_identity={'device': identity[0], 'inode': identity[1]})
        self.unit = path.name
        self._relative = '/' + self.unit

    def accept_backup_ack(self, ack):
        try:
            require(self.processing_backup_stage is not None and self.memory_phase == 'processing' and self.backup_ack is None)
            self.backup_ack = self._phase_state.accept_ack(ack)
            self.memory_phase, self.container_limit = 'backup', capacity().HARD_LIMIT
            self.sample()
            return self.backup_ack
        except BaseException:
            if self._phase_state is not None:
                self._phase_state.fail()
            raise

    def begin_backup(self, proof):
        try:
            require(self.processing_backup_stage is not None and self.memory_phase == 'processing'
                    and self.backup_ack is None and callable(self.backup_transition)
                    and not self._transition_attempted and not self._phase_state.failed)
            self._transition_attempted = True
            phase_contract().validate_boundary(proof, self.processing_backup_stage, phase_context(self._context))
            return self.accept_backup_ack(self.backup_transition(proof))
        except BaseException:
            if self._phase_state is not None:
                self._phase_state.fail()
            raise

    def phase_closure(self, final_sample=None):
        require(self.memory_phase == 'backup' and self.backup_ack is not None)
        value = self.sample() if final_sample is None else final_sample
        self._phase_state.observe(value)
        return phase_contract().closure(self.backup_ack, value)

    def check_context(self, context):
        require(self._context == context)
        return self.sample()

    def check_pid(self, pid, container_id=None):
        require(type(pid) is int and pid > 1)
        path = membership(Path('/proc', str(pid), 'cgroup').read_text())
        require(path == self._relative or path.startswith(self._relative + '/'))
        if container_id is not None:
            require(isinstance(container_id, str) and re.fullmatch('[a-f0-9]{64}', container_id)
                    and container_id in path)
        return path

    def component_snapshot(self, groups):
        """Optional passive observation; never changes the existing guard or limits."""
        if not hasattr(self, '_component_meter'):
            spec = importlib.util.spec_from_file_location('w15_separate_component_meter',
                Path(__file__).with_name('component_resource_meter.py'))
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            self._component_meter = module.Meter()
        return self._component_meter.observe(self.path, self._identity, groups)

    def functional_observation(self, role_bindings=()):
        """Reuse existing passive PSS/kernel meters inside the owner's guard.

        No process creation, names/argv guesses, limit changes or provider
        acceptance. PSS maxima at different times are never a RAM sum.
        """
        require(self.functional_stage in ('end500','mock500'))
        module=functional_contract().load('memory_components')
        components=module.observe(self.path,self._identity,role_bindings)
        for role,row in components['roles'].items():
            amount=row['observedPSSBytes']
            if type(amount) is int:
                self._functional_component_maxima[role]=max(amount,self._functional_component_maxima.get(role,0))
        return {'schema':'helmut-w15-functional-resource-observation/1',
            'resourceContract':functional_contract().CONTRACT,'memoryProfile':self.profile,
            'sampleCount':self._functional_samples,
            'firstKernel':json.loads(json.dumps(self._functional_first_kernel)),
            'lastKernel':json.loads(json.dumps(self._functional_kernel)),
            'components':components,
            'componentPSSMaxima':{role:self._functional_component_maxima.get(role,'UNKNOWN') for role in module.ROLES},
            'snapshotAtomic':False,'peakCompositionKnown':False,'fileCacheAdditiveToPSS':False,
            'differentTimeMaximaAdditive':False,'applicationWithTestDriverCombined':True,
            'providerResourceAccepted':False,'fullLifetimeClosureAccepted':False,'executionAuthority':False}

    def sample(self):
        current = None
        self._last_valid = False
        fd = _kernel_directory(self.path)
        try:
            s = os.fstat(fd)
            require((s.st_dev, s.st_ino) == self._identity)
            self.check_pid(os.getpid())
            def read(name):
                child = os.open(name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=fd)
                try:
                    raw = os.read(child, 8193)
                    require(len(raw) <= 8192)
                    return raw.decode('ascii').strip()
                finally:
                    os.close(child)
            value = {'configuredLimit': read('memory.max'), 'swapMaximum': read('memory.swap.max'),
                     'kernelLifetimePeakBytes': int(read('memory.peak')),
                     'currentBytes': int(read('memory.current')),
                     'swapCurrentBytes': int(read('memory.swap.current')),
                     'events': {k: int(v) for k, v in (x.split() for x in read('memory.events').splitlines())}}
            current = value
            self._last_observed, self._last_valid = value, False
            if self.host_capacity_admission is not None:
                value['hostCapacityBudget'] = self.host_capacity_budget
                value['hostCapacitySafetyObserved'] = False
            if self.functional_stage is not None or self.capacity_diagnostic or self.processing_backup_stage is not None and self.memory_phase == 'backup':
                value['capacityMeasurement'] = capacity().snapshot(value, fd)
            if self.host_capacity_admission is not None:
                value['hostCapacityObservation'] = capacity().host_runtime_guard(self.host_capacity_admission)
                capacity().host_assess(value, self.host_capacity_admission)
                value['hostCapacitySafetyObserved'] = True
            elif self.functional_stage is not None:
                functional_contract().assess(value, self.functional_stage)
                try:
                    self._functional_kernel=functional_contract().load('component_resource_meter')._kernel(fd)
                    if self._functional_samples==0:
                        self._functional_first_kernel=json.loads(json.dumps(self._functional_kernel))
                except Exception:
                    self._functional_kernel='UNKNOWN'
                self._functional_samples+=1
            elif self.processing_backup_stage is not None:
                self._phase_state.observe(value)
            else:
                (capacity().assess if self.capacity_diagnostic else assess)(value)
            self._last_valid = True
            return value
        except KeyboardInterrupt as error:
            if self._phase_state is not None:
                self._phase_state.fail()
            self._last_valid = False
            if current is not None:
                current['postFailureMemoryStat'] = capture_post_failure_memory_stat(fd)
            error.failure_memory = project_failure_memory(current, False)
            raise
        except Exception:
            if self._phase_state is not None:
                self._phase_state.fail()
            self._last_valid = False
            if current is not None:
                current['postFailureMemoryStat'] = capture_post_failure_memory_stat(fd)
            raise ResourceError('COMMON_TEST_RESOURCE_BINDING_REJECTED') from None
        finally:
            os.close(fd)

    def last_observation(self):
        return {'lastReadbackValid': self._last_valid,
                'lastObservedKernelSample': json.loads(json.dumps(self._last_observed)),
                'fullLifetimeClosureAccepted': False}

    def failure_observation(self):
        """Project the existing cached sample. No kernel read or peak reset."""
        return project_failure_memory(self._last_observed, self._last_valid)

    def safe_summary(self):
        value = self.sample()
        if self.host_capacity_admission is not None:
            return {'status': 'HOST_CAPACITY_DIAGNOSTIC_CURRENT_SAMPLE_ONLY', **value,
                    'memoryProfile': HOST_PROFILE, 'containerMemoryLimitBytes': self.container_limit,
                    'legacyContractAccepted': False, 'end500Acceptance': False,
                    'mock500Acceptance': False, 'providerResourceAccepted': False,
                    'fullLifetimeClosureAccepted': False, 'executionAuthority': False}
        if self.functional_stage is not None:
            return {'status': 'FUNCTIONAL_PARENT_CURRENT_SAMPLE_ONLY', **value,
                    **functional_contract().reference_summary(value, self.functional_stage),
                    'pythonOrchestratorInsideParent': True, 'containerMemoryLimitBytes': self.container_limit}
        if self.processing_backup_stage is not None:
            return {'status': 'PHASED_PARENT_CURRENT_SAMPLE_ONLY', **value,
                    'resourceContract': phase_contract().profile(self.processing_backup_stage),
                    'phase': self.memory_phase, 'commonLifetimeMemoryAccepted': False, 'executionAuthority': False}
        if self.capacity_diagnostic:
            return {'status': 'CAPACITY_DIAGNOSTIC_CURRENT_SAMPLE_ONLY', **value,
                    'legacyContractAccepted': False, 'executionAuthority': False}
        return {'status': 'PASS_OBSERVED_COMMON_PARENT_CURRENT_SAMPLE_ONLY', **value,
                'pythonOrchestratorInsideParent': True, 'containerMemoryLimitBytes': LIMIT,
                'maximumActualCommonLifetimePeakBytes': MAXIMUM, 'requiredReserveBytes': RESERVE,
                'executionAuthority': False, 'fullLifetimeClosureAccepted': False,
                'readiness': 'SEPARATE_RUN_GO_AND_COMPLETE_CLOSURE_REQUIRED'}


def _kernel_directory(path):
    require(path.parent == KERNEL_ROOT and re.fullmatch(r'w15_[1-9][0-9]{4,19}_[a-f0-9]{32}\.slice', path.name))
    root = os.open(KERNEL_ROOT, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        fd = os.open(path.name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=root)
        value, ancestor = os.fstat(fd), os.fstat(root)
        try:
            require(stat.S_ISDIR(value.st_mode) and value.st_uid == 0 and value.st_dev == ancestor.st_dev)
        except BaseException:
            os.close(fd)
            raise
        return fd
    finally:
        os.close(root)


def observe(context, *, capacity_diagnostic=False, processing_backup_stage=None, end_capacity_diagnostic=False, functional_stage=None, host_capacity_admission=None):
    """Only after entering the externally prepared, actually limited parent.

    This is an observation API, not a systemd bootstrap, UID conversion, fresh
    runner attestation or start permission. It never sets limits or permissions.
    """
    try:
        require(isinstance(context, dict) and os.getuid() == os.getgid() == 1000)
        require(type(context['runAttempt']) is int and context['runAttempt'] == 1
                and isinstance(context['runId'], str) and re.fullmatch('[1-9][0-9]{4,19}', context['runId']))
        nonce = uuid.UUID(context['nonce'])
        require(str(nonce) == context['nonce'] and nonce.version == 4 and nonce.variant == uuid.RFC_4122)
        path = KERNEL_ROOT / ('w15_' + context['runId'] + '_' + nonce.hex + '.slice')
        fd = _kernel_directory(path)
        try:
            value = os.fstat(fd)
        finally:
            os.close(fd)
        result = CommonResources(TOKEN, context, path, (value.st_dev, value.st_ino),
            capacity_diagnostic=capacity_diagnostic, processing_backup_stage=processing_backup_stage,
            end_capacity_diagnostic=end_capacity_diagnostic, functional_stage=functional_stage,
            host_capacity_admission=host_capacity_admission)
        result.sample()
        return result
    except Exception:
        raise ResourceError('COMMON_TEST_RESOURCE_BINDING_REJECTED') from None
