"""Fresh restore-only disk admission and shared lifetime guards; no start authority.

Every retained copy is charged. Nothing is deleted to make the plan pass. The
RAM contract is imported unchanged from common_resources. Unknown observations
raise a fixed error instead of becoming a zero byte estimate.
"""
import sys
sys.dont_write_bytecode = True

import importlib.util
import os
from pathlib import Path
import stat
import time


def _load(name):
    spec = importlib.util.spec_from_file_location('w15_restore_resource_' + name,
                                                Path(__file__).with_name(name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


C = _load('common_resources')
MiB = 1024 * 1024
FREE_RESERVE_BYTES = 512 * MiB
# Explicit ceilings, not predictions. Separate WAL/SQL/copy charges deliberately
# overcount nested PGDATA rather than undercount retained bytes.
FIXED_BUDGETS = {
    'cipherParts15': 242693044,
    'cipherConcatenation': 242693044,
    'originalFiles12': 242570240,
    'provenanceAndInputValidation': 16 * MiB,
    'cacheAndPrepare': 192 * MiB,
    'readonlyMaterialization': 192 * MiB,
    'postgresData': 768 * MiB,
    'postgresWAL': 384 * MiB,
    'postgresTemporary': 256 * MiB,
    'renderedSQLContainer': 64 * MiB,
    'renderedSQLPrivateReadback': 64 * MiB,
    'privateLogsAndRuntimeState': 64 * MiB,
    'fullEnd500NativeAudit': 64 * MiB,
    'finalDatabaseDumpAndRoles': 256 * MiB,
    'freshRecoveryPostgresData': 768 * MiB,
    'freshRecoveryWALAndTemporary': 512 * MiB,
    'freshRecoveryRenderedSQLCopies': 512 * MiB,
    'freshRecoveryLogs': 32 * MiB,
    'freshRecoveryRuntimeFiles': 128 * MiB,
    'freshRecoveryFinalDumpAndRoles': 256 * MiB,
    'officialArtifactToolsAndPrivateLogs': 64 * MiB,
}
# Charge every potentially selected retained source. This is deliberately
# derived from the physical source ceilings, not a guessed small artifact cap.
MAX_SELECTION_BYTES = sum(FIXED_BUDGETS[k] for k in (
    'originalFiles12', 'provenanceAndInputValidation', 'cacheAndPrepare',
    'readonlyMaterialization', 'renderedSQLContainer',
    'renderedSQLPrivateReadback', 'privateLogsAndRuntimeState',
    'fullEnd500NativeAudit', 'finalDatabaseDumpAndRoles'))
MAX_ARCHIVE_MEMBERS = 100000
ARCHIVE_OVERHEAD_BYTES = MAX_ARCHIVE_MEMBERS * 1024 + 8 * MiB + 16 * MiB
MAX_CIPHER_BYTES = MAX_SELECTION_BYTES + ARCHIVE_OVERHEAD_BYTES
FIXED_BUDGETS.update({
    'completePrivateSelection': MAX_SELECTION_BYTES,
    'encryptedBackup': MAX_CIPHER_BYTES,
    'offhostCipherDownload': MAX_CIPHER_BYTES,
    'artifactTransportZipAllowance': MAX_CIPHER_BYTES,
    'authenticatedReadback': MAX_SELECTION_BYTES + 8 * MiB,
})


class ResourceRejected(RuntimeError):
    pass


def need(value, code='RESTORE_RESOURCE_PLAN_REJECTED'):
    if not value:
        raise ResourceRejected(code)


def _amount(value):
    need(type(value) is int and 0 <= value <= 16 * 1024 * MiB)
    return value


def tree_bytes(root):
    """Measure committed/staged ordinary trees without following any links.

    Git object hardlinks and checkout symlinks are rejected for staged inputs;
    the runner bootstrap creates its own plain readable source copy first.
    """
    root = Path(root)
    need(root.is_absolute())
    total = 0
    pending = [root]
    while pending:
        current = pending.pop()
        value = current.lstat()
        need(not stat.S_ISLNK(value.st_mode))
        if stat.S_ISDIR(value.st_mode):
            pending.extend(current / name for name in os.listdir(current))
        else:
            need(stat.S_ISREG(value.st_mode) and value.st_nlink == 1)
            total += value.st_size
            _amount(total)
    return total


def _disk(root):
    root = Path(root)
    need(root.is_absolute())
    value = root.lstat()
    need(stat.S_ISDIR(value.st_mode) and not stat.S_ISLNK(value.st_mode))
    observed = os.statvfs(root)
    need(observed.f_frsize > 0 and observed.f_blocks > 0 and observed.f_bavail >= 0)
    return {'device': value.st_dev,
            'totalBytes': observed.f_blocks * observed.f_frsize,
            'availableBytes': observed.f_bavail * observed.f_frsize,
            'measuredMonotonicNS': time.monotonic_ns()}


def admit_disk_plan(filesystem_root, *, checkout_bytes, binary_bytes, maximum_wall_seconds=3600):
    """Charge the complete retained restore+backup+recovery footprint freshly.

    Existing image layers are already included in measured disk usage. This
    plan does not pull images. Checkout/binaries are charged again, intentionally
    conservative when they were staged before this admission.
    """
    budgets = {'stagedCheckout': _amount(checkout_bytes),
               'stagedPinnedBinaries': _amount(binary_bytes), **FIXED_BUDGETS}
    need(checkout_bytes > 0 and binary_bytes > 0)
    need(type(maximum_wall_seconds) is int and maximum_wall_seconds in (300, 1800, 3600))
    observed = _disk(filesystem_root)
    required = sum(budgets.values()) + FREE_RESERVE_BYTES
    need(observed['availableBytes'] >= required, 'RESTORE_FULL_DISK_PLAN_DOES_NOT_FIT')
    return {'schema': 'helmut-w15-restore-resource-plan/1',
            'status': 'PASS_FRESH_DISK_ADMISSION_ONLY', 'disk': observed,
            'budgets': budgets, 'requiredAdditionalBytes': required,
            'minimumFreeReserveBytes': FREE_RESERVE_BYTES,
            'maximumCipherBytes': MAX_CIPHER_BYTES,
            'maximumSelectionBytes': MAX_SELECTION_BYTES,
            'maximumWallSeconds': maximum_wall_seconds,
            'commonMemoryLimitBytes': C.LIMIT,
            'maximumActualCommonLifetimePeakBytes': C.MAXIMUM,
            'requiredMemoryReserveBytes': C.RESERVE,
            'swapMaximumBytes': 0,
            'includesOffhostDownloadAndFreshRecovery': True,
            'imagePullAllowed': False, 'automaticDeletionAllowed': False,
            'executionAuthority': False, 'fullLifetimeClosureAccepted': False}


class DiskGuard:
    """Check fresh free space and the same actual common parent on every call.

    ``paths`` can bind each disjoint disk category to its actual paths as those
    paths become known. Unmapped categories remain reserved at their full cap.
    Every known path is measured, and a capacity overflow stops immediately.
    """
    def __init__(self, filesystem_root, plan, common_resources, *, paths=None):
        self.root, self.plan, self.common = Path(filesystem_root), plan, common_resources
        self.paths = {} if paths is None else dict(paths)
        self.started = time.monotonic()
        need(isinstance(plan, dict) and plan.get('schema') == 'helmut-w15-restore-resource-plan/1'
             and plan.get('budgets') == {'stagedCheckout': plan['budgets'].get('stagedCheckout'),
                 'stagedPinnedBinaries': plan['budgets'].get('stagedPinnedBinaries'), **FIXED_BUDGETS}
             and callable(getattr(common_resources, 'sample', None)))
        need(plan['minimumFreeReserveBytes'] == FREE_RESERVE_BYTES
             and plan['maximumWallSeconds'] in (300, 1800, 3600))
        self.last = None
        self()

    def __call__(self):
        need(time.monotonic() - self.started < self.plan['maximumWallSeconds'], 'RESTORE_WALL_DEADLINE')
        sample = self.common.sample()
        if getattr(self.common, 'functional_stage', None) in ('end500','mock500'):
            C.functional_contract().assess(sample,self.common.functional_stage)
        elif getattr(self.common, 'processing_backup_stage', None) in ('end500', 'mock500'):
            C.phase_contract().assess(sample, self.common.processing_backup_stage, phase=self.common.memory_phase)
        else:
            (C.capacity().assess if getattr(self.common, 'capacity_diagnostic', False) is True else C.assess)(sample)
        observed = _disk(self.root)
        need(observed['device'] == self.plan['disk']['device'])
        growth = max(0, self.plan['disk']['availableBytes'] - observed['availableBytes'])
        need(growth <= sum(self.plan['budgets'].values()), 'RESTORE_DISK_GROWTH_LIMIT')
        need(observed['availableBytes'] >= FREE_RESERVE_BYTES, 'RESTORE_DISK_RESERVE_LOST')
        measured, roots = {}, []
        for role, paths in self.paths.items():
            need(role in self.plan['budgets'] and isinstance(paths, (tuple, list)))
            total = 0
            for path in paths:
                path = Path(path)
                need(path.is_absolute() and path.exists())
                need(path.lstat().st_dev == observed['device'])
                need(all(path != old and path not in old.parents and old not in path.parents for old in roots))
                roots.append(path)
                total += tree_bytes(path)
            need(total <= self.plan['budgets'][role], 'RESTORE_DISK_CATEGORY_LIMIT')
            measured[role] = total
        self.last = {'disk': observed, 'commonKernelSample': sample,
                     'measuredCategories': measured, 'growthBytes': growth,
                     'fullLifetimeClosureAccepted': False}
        return self.last


def cost_envelope():
    """Published unit bound, not an assertion about account quota availability."""
    return {'runner': 'public repository standard GitHub-hosted Linux runner',
            'runnerMaximumMinutes': 60, 'runnerUSD': '0 for public standard runner',
            'modelCalls': 0, 'newInfrastructure': False,
            'encryptedArtifactMaximumBytes': MAX_CIPHER_BYTES,
            'artifactRetentionDays': 1,
            'artifactStorageMaximumByteDays': MAX_CIPHER_BYTES,
            'artifactPublishedStorageUSDPerGBMonth': '0.25',
            # The measured source ceilings imply less than 3GB. At most one
            # day plus hourly rounding at $0.25/GB/month remains below $0.04
            # even for a 28-day month. No account allowance is assumed.
            'artifactMaximumStorageUSD': '0.05',
            'artifactQuotaAvailabilityAssumed': False,
            'costAuthorityGranted': False,
            'basis': 'https://docs.github.com/en/billing/concepts/product-billing/github-actions'}
