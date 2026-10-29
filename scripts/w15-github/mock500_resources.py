"""Observe the existing shared parent using the unchanged Mock500 v2 contract.

This type is deliberately separate from End500's v3 observer. It never creates
or retunes a cgroup, clears caches, resets peaks or grants test permission.
"""
import sys
sys.dont_write_bytecode = True

import importlib.util
import json
import os
from pathlib import Path
import re
import time
import uuid


def _load(name):
    spec = importlib.util.spec_from_file_location('w15_mock_resources_' + name,
                                                Path(__file__).with_name(name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


C, D = _load('common_resources'), _load('restore_resources')
LIMIT, MAXIMUM, RESERVE = 2048000000, 1638400000, 409600000
PROFILE = 'helmut-w15-memory-check/2'
SCOPE = 'ISOLATED_GITHUB_MOCK500_BINDING_ONLY'
PROCESSING_SECONDS, COMPLETION_SECONDS = 10800, 12600
TOKEN = object()
HISTORICAL_FAILURE = {'status': 'FAIL_OR_UNKNOWN', 'peakBytes': 1644748800,
    'maximumAllowedPeakBytes': MAXIMUM, 'completedUnits': 69, 'expectedUnits': 500,
    'completedControls': 1104, 'expectedControls': 8000,
    'completedResults': 207, 'expectedResults': 1500, 'acceptedAsPass': False}


class ResourceRejected(RuntimeError):
    pass


def need(value, code='MOCK500_COMMON_RESOURCE_BINDING_REJECTED'):
    if not value:
        raise ResourceRejected(code)


def assess(value):
    need(isinstance(value, dict) and value.get('configuredLimit') == str(LIMIT)
         and value.get('swapMaximum') == '0')
    need(all(type(value.get(k)) is int and 0 <= value[k] <= MAXIMUM
             for k in ('currentBytes', 'kernelLifetimePeakBytes')))
    need(type(value.get('swapCurrentBytes')) is int and value['swapCurrentBytes'] == 0)
    events = value.get('events')
    need(isinstance(events, dict) and all(type(events.get(k)) is int and events[k] == 0
         for k in ('max', 'oom', 'oom_kill', 'oom_group_kill')))
    need(LIMIT - value['kernelLifetimePeakBytes'] >= RESERVE)
    return value


class MockCommonResources(C.CommonResources):
    profile = PROFILE

    def __init__(self, token, context, path, identity):
        need(token is TOKEN)
        super().__init__(C.TOKEN, context, path, identity)

    def sample(self):
        # Reuse the established no-follow kernel directory and actual process
        # membership checks. Only the immutable v2 assessment differs.
        fd = C._kernel_directory(self.path)
        try:
            value = os.fstat(fd)
            need((value.st_dev, value.st_ino) == self._identity)
            self.check_pid(os.getpid())
            def read(name):
                child = os.open(name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=fd)
                try:
                    raw = os.read(child, 8193)
                    need(len(raw) <= 8192)
                    return raw.decode('ascii').strip()
                finally:
                    os.close(child)
            observed = {'configuredLimit': read('memory.max'), 'swapMaximum': read('memory.swap.max'),
                'kernelLifetimePeakBytes': int(read('memory.peak')), 'currentBytes': int(read('memory.current')),
                'swapCurrentBytes': int(read('memory.swap.current')),
                'events': {k: int(v) for k, v in (line.split() for line in read('memory.events').splitlines())}}
            self._last_observed, self._last_valid = observed, False
            assess(observed)
            self._last_valid = True
            return observed
        except (Exception, KeyboardInterrupt):
            self._last_valid = False
            raise ResourceRejected('MOCK500_COMMON_RESOURCE_BINDING_REJECTED') from None
        finally:
            os.close(fd)

    def safe_summary(self):
        return {'status': 'PASS_OBSERVED_MOCK500_V2_PARENT_SAMPLE_ONLY', **self.sample(),
            'memoryProfile': PROFILE, 'pythonOrchestratorInsideParent': True,
            'containerMemoryLimitBytes': LIMIT, 'maximumActualCommonLifetimePeakBytes': MAXIMUM,
            'requiredReserveBytes': RESERVE, 'executionAuthority': False,
            'fullLifetimeClosureAccepted': False, 'mock500Acceptance': False}


def observe(context):
    try:
        need(isinstance(context, dict) and context.get('schema') == 'helmut-w15-mock500-controller-context/1'
             and context.get('scope') == SCOPE and context.get('executionAuthority') is False
             and os.getuid() == os.getgid() == 1000)
        need(type(context['runAttempt']) is int and context['runAttempt'] == 1
             and isinstance(context['runId'], str) and re.fullmatch('[1-9][0-9]{4,19}', context['runId']))
        nonce = uuid.UUID(context['nonce'])
        need(str(nonce) == context['nonce'] and nonce.version == 4 and nonce.variant == uuid.RFC_4122)
        path = C.KERNEL_ROOT / ('w15_' + context['runId'] + '_' + nonce.hex + '.slice')
        fd = C._kernel_directory(path)
        try:
            value = os.fstat(fd)
        finally:
            os.close(fd)
        resource = MockCommonResources(TOKEN, context, path, (value.st_dev, value.st_ino))
        resource.sample()
        return resource
    except (Exception, KeyboardInterrupt):
        raise ResourceRejected('MOCK500_COMMON_RESOURCE_BINDING_REJECTED') from None


# Reuse every reviewed physical copy category and the existing 64MiB full
# audit ceiling. Never truncate an audit or assume compression/free storage.
BUDGETS = {('fullMock500NativeAudit' if k == 'fullEnd500NativeAudit' else k): v
           for k, v in D.FIXED_BUDGETS.items()}
MAX_SELECTION_BYTES = D.MAX_SELECTION_BYTES
MAX_CIPHER_BYTES = MAX_SELECTION_BYTES + D.ARCHIVE_OVERHEAD_BYTES
BUDGETS.update({'completePrivateSelection': MAX_SELECTION_BYTES, 'encryptedBackup': MAX_CIPHER_BYTES,
    'offhostCipherDownload': MAX_CIPHER_BYTES, 'artifactTransportZipAllowance': MAX_CIPHER_BYTES,
    'authenticatedReadback': MAX_SELECTION_BYTES + 8 * D.MiB})


def admit_disk_plan(filesystem_root, *, checkout_bytes, binary_bytes, additional_asset_bytes,
                    maximum_wall_seconds=COMPLETION_SECONDS):
    need(maximum_wall_seconds == COMPLETION_SECONDS and type(maximum_wall_seconds) is int)
    need(D._amount(checkout_bytes) > 0 and D._amount(binary_bytes) > 0)
    need(D._amount(additional_asset_bytes) > 0, 'MOCK500_ADDITIONAL_ASSET_BYTE_BOUND_REQUIRED')
    budgets = {'stagedCheckout': checkout_bytes, 'stagedPinnedBinaries': binary_bytes,
        'mockPrivateAssetSources': additional_asset_bytes,
        'mockPrivateAssetMaterialization': additional_asset_bytes, **BUDGETS}
    disk = D._disk(filesystem_root)
    required = sum(budgets.values()) + D.FREE_RESERVE_BYTES
    need(disk['availableBytes'] >= required, 'MOCK500_COMPLETE_RETAINED_DISK_PLAN_DOES_NOT_FIT')
    return {'schema': 'helmut-w15-mock500-resource-plan/1', 'status': 'PASS_FRESH_DISK_ADMISSION_ONLY',
        'memoryProfile': PROFILE, 'disk': disk, 'budgets': budgets,
        'requiredAdditionalBytes': required, 'minimumFreeReserveBytes': D.FREE_RESERVE_BYTES,
        'additionalPrivateAssetBoundBytes': additional_asset_bytes,
        'maximumSelectionBytes': MAX_SELECTION_BYTES, 'maximumCipherBytes': MAX_CIPHER_BYTES,
        'processingSeconds': PROCESSING_SECONDS, 'maximumWallSeconds': COMPLETION_SECONDS,
        'commonMemoryLimitBytes': LIMIT, 'maximumActualCommonLifetimePeakBytes': MAXIMUM,
        'requiredMemoryReserveBytes': RESERVE, 'swapMaximumBytes': 0,
        'automaticDeletionAllowed': False, 'executionAuthority': False, 'mock500Acceptance': False}


class DiskGuard:
    def __init__(self, filesystem_root, plan, resources, *, started_monotonic, paths=None):
        need(isinstance(plan, dict) and plan.get('schema') == 'helmut-w15-mock500-resource-plan/1'
             and plan.get('memoryProfile') == PROFILE and callable(getattr(resources, 'sample', None))
             and getattr(resources, 'profile', None) == PROFILE)
        self.root, self.plan, self.resources = Path(filesystem_root), json.loads(json.dumps(plan)), resources
        budgets = self.plan['budgets']
        need(D._amount(budgets['stagedCheckout']) > 0 and D._amount(budgets['stagedPinnedBinaries']) > 0
             and D._amount(self.plan['additionalPrivateAssetBoundBytes']) > 0
             and budgets == {'stagedCheckout': budgets['stagedCheckout'],
                 'stagedPinnedBinaries': budgets['stagedPinnedBinaries'],
                 'mockPrivateAssetSources': self.plan['additionalPrivateAssetBoundBytes'],
                 'mockPrivateAssetMaterialization': self.plan['additionalPrivateAssetBoundBytes'], **BUDGETS}
             and self.plan['minimumFreeReserveBytes'] == D.FREE_RESERVE_BYTES
             and self.plan['maximumWallSeconds'] == COMPLETION_SECONDS
             and self.plan['commonMemoryLimitBytes'] == LIMIT
             and self.plan['maximumActualCommonLifetimePeakBytes'] == MAXIMUM
             and self.plan['requiredMemoryReserveBytes'] == RESERVE)
        self.paths = {} if paths is None else dict(paths)
        self.started = started_monotonic
        need(type(self.started) in (int, float) and 0 <= self.started <= time.monotonic())
        self.last = None
        self()

    def __call__(self):
        need(0 <= time.monotonic() - self.started < COMPLETION_SECONDS, 'MOCK500_COMPLETION_DEADLINE')
        sample = assess(self.resources.sample())
        disk = D._disk(self.root)
        need(disk['device'] == self.plan['disk']['device'])
        growth = max(0, self.plan['disk']['availableBytes'] - disk['availableBytes'])
        need(disk['availableBytes'] >= D.FREE_RESERVE_BYTES and growth <= sum(self.plan['budgets'].values()),
             'MOCK500_DISK_RESERVE_OR_GROWTH_LIMIT')
        totals, roots = {}, []
        for role, paths in self.paths.items():
            need(role in self.plan['budgets'] and isinstance(paths, (tuple, list)))
            total = 0
            for path in paths:
                path = Path(path)
                need(path.is_absolute() and path.lstat().st_dev == disk['device'])
                need(all(path != old and path not in old.parents and old not in path.parents for old in roots))
                roots.append(path)
                total += D.tree_bytes(path)
            need(total <= self.plan['budgets'][role], 'MOCK500_DISK_CATEGORY_LIMIT')
            totals[role] = total
        self.last = {'disk': disk, 'commonKernelSample': sample, 'growthBytes': growth,
                     'measuredCategories': totals, 'memoryProfile': PROFILE,
                     'fullLifetimeClosureAccepted': False, 'mock500Acceptance': False}
        return self.last
