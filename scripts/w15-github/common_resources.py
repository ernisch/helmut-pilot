"""Observe an existing fresh common cgroup; never create or change resources.

The explicit parent must contain the Python orchestrator and every container
child. A container-only peak is rejected. Keep this same kernel lifetime for
input materialization, work, native audit and backup closure; never reset it.
"""
import sys
sys.dont_write_bytecode = True

import json
import os
from pathlib import Path
import re
import stat
import uuid

LIMIT, MAXIMUM, RESERVE = 2560000000, 2048000000, 512000000
KERNEL_ROOT = Path('/sys/fs/cgroup')
TOKEN = object()


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
    if type(value) is not dict or set(value) != keys or type(value['lastReadbackValid']) is not bool:
        return None
    if any(type(value[k]) is not int or not 0 <= value[k] <= 2**53 - 1
           for k in keys - {'lastReadbackValid', 'events'}):
        return None
    if type(value['events']) is not dict or set(value['events']) != set(events) or any(
            type(value['events'][k]) is not int or not 0 <= value['events'][k] <= 2**53 - 1 for k in events):
        return None
    return json.loads(json.dumps(value))


class CommonResources:
    def __init__(self, token, context, path, identity):
        require(token is TOKEN)
        self._context = json.loads(json.dumps(context))
        self.path, self._identity = path, identity
        self._last_observed, self._last_valid = None, False
        self.unit = path.name
        self._relative = '/' + self.unit

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

    def sample(self):
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
            self._last_observed, self._last_valid = value, False
            assess(value)
            self._last_valid = True
            return value
        except (Exception, KeyboardInterrupt):
            self._last_valid = False
            raise ResourceError('COMMON_TEST_RESOURCE_BINDING_REJECTED') from None
        finally:
            os.close(fd)

    def last_observation(self):
        return {'lastReadbackValid': self._last_valid,
                'lastObservedKernelSample': json.loads(json.dumps(self._last_observed)),
                'fullLifetimeClosureAccepted': False}

    def failure_observation(self):
        """Project the existing cached sample. No kernel read or peak reset."""
        value = self._last_observed
        if type(value) is not dict:
            return None
        try:
            for key in ('configuredLimit', 'swapMaximum'):
                if type(value[key]) is not str or re.fullmatch('[0-9]{1,16}', value[key]) is None:
                    return None
            result = {key: value[key] for key in ('kernelLifetimePeakBytes', 'currentBytes', 'swapCurrentBytes')}
            result.update(configuredLimitBytes=int(value['configuredLimit']), swapMaximumBytes=int(value['swapMaximum']),
                lastReadbackValid=self._last_valid,
                events={key: value['events'][key] for key in ('max', 'oom', 'oom_kill', 'oom_group_kill')})
            return closed_failure_memory(result)
        except (KeyError, TypeError, ValueError):
            return None

    def safe_summary(self):
        value = self.sample()
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


def observe(context):
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
        result = CommonResources(TOKEN, context, path, (value.st_dev, value.st_ino))
        result.sample()
        return result
    except (Exception, KeyboardInterrupt):
        raise ResourceError('COMMON_TEST_RESOURCE_BINDING_REJECTED') from None
