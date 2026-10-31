"""Approved isolated End500/Mock500 function contract; never provider acceptance.

Only this explicit branch uses the existing whole-host safety envelope for the
entire lifetime. Historical contracts, limits and failed observations stay
unchanged. This module performs no process, resource, network or data mutation.
"""
import sys
sys.dont_write_bytecode = True

from datetime import datetime, timedelta, timezone
from functools import lru_cache
import importlib.util
from pathlib import Path
from zoneinfo import ZoneInfo

CONTRACT = 'helmut-w15-isolated-functional/1'
END_MODE = 'end500-full-functional-gated'
MOCK_MODE = 'mock500-full-functional-gated'
END_PROFILE = 'helmut-w15-end500-functional/1'
MOCK_PROFILE = 'helmut-w15-mock500-functional/1'
SCOPES = {END_MODE: 'ISOLATED_GITHUB_END500_FUNCTIONAL_ONLY',
          MOCK_MODE: 'ISOLATED_GITHUB_MOCK500_FUNCTIONAL_ONLY'}
PROCESSING_SECONDS = {'end500': 3600, 'mock500': 10800}
WALL_SECONDS = {'end500': 3600, 'mock500': 12600}
FIRST_DAY, LAST_DAY = '2026-11-01', '2026-11-07'
MAX_ATTEMPTS = 3
MAX_STORAGE_CENTS_PER_ATTEMPT, MAX_STORAGE_CENTS_CHAIN = 5, 15
MAX_ARTIFACTS_PER_ATTEMPT, ARTIFACT_RETENTION_DAYS = 1, 1
ACCEPTANCE_SCHEMA = 'helmut-w15-independent-end500-acceptance/3'
END_ACCEPTANCE_STATUS = 'PASS_INDEPENDENT_GITHUB_END500_FUNCTIONAL_ACCEPTANCE'


class FunctionalRejected(ValueError):
    def __init__(self):
        super().__init__('ISOLATED_FUNCTIONAL_CONTRACT_REJECTED')


def need(value):
    if not value:
        raise FunctionalRejected()


@lru_cache(maxsize=4)
def load(name):
    spec = importlib.util.spec_from_file_location('w15_functional_' + name,
        Path(__file__).with_name(name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# Reuse the previously qualified machine constants, not rounded GB labels.
HARD_LIMIT = load('phase_contract').HARD_LIMIT
HOST_RESERVE = load('phase_contract').HOST_RESERVE


def stage(mode):
    return {END_MODE: 'end500', MOCK_MODE: 'mock500'}.get(mode) if type(mode) is str else None


def _stage(value):
    need(type(value) is str and value in WALL_SECONDS)
    return value


def profile(value):
    return {'end500': END_PROFILE, 'mock500': MOCK_PROFILE}[_stage(value)]


def limits(value):
    _stage(value)
    return {'comparisonBudgetBytes': HARD_LIMIT, 'maximumConsumptionBytes': HARD_LIMIT,
            'requiredReserveBytes': 0, 'swapBytes': 0}


def assess(sample, value):
    """Enforce the actual shared safety cap; old processing peaks are references."""
    _stage(value)
    try:
        load('restore_capacity').assess(sample)
        detail = sample.get('capacityMeasurement')
        need(type(detail) is dict and load('restore_capacity').closed(detail) is not None
             and type(detail['last']['hostAvailableBytes']) is int
             and detail['last']['hostAvailableBytes'] >= HOST_RESERVE)
    except (KeyError, TypeError, ValueError):
        raise FunctionalRejected() from None
    return sample


def reference_summary(sample, value):
    """Whole-parent historical comparison; no component/provider extrapolation."""
    assess(sample, value)
    old = load('phase_contract').processing_limits(value)
    return {'resourceContract': CONTRACT, 'memoryProfile': profile(value),
            'physicalHardLimitBytes': HARD_LIMIT, 'minimumHostReserveBytes': HOST_RESERVE,
            'historicalProcessingPeakBytes': old['maximumConsumptionBytes'],
            'historicalProcessingPeakExceeded': sample['kernelLifetimePeakBytes'] > old['maximumConsumptionBytes'],
            'historicalRegularMemoryAccepted': False, 'providerResourceAccepted': False,
            'applicationProviderCapacity': 'UNKNOWN', 'databaseProviderCapacity': 'UNKNOWN',
            # Successful allocations are established by actual work/return codes,
            # never inferred merely from the absence of an OOM event.
            'allocationFailureObserved': 'UNKNOWN', 'fullLifetimeClosureAccepted': False,
            'executionAuthority': False}


def validate_window(value, now):
    """Only the new version receives the approved real November run window."""
    value = _stage(value)
    need(isinstance(now, datetime) and now.tzinfo is not None and now.utcoffset() is not None)
    begin = now.astimezone(timezone.utc)
    finish = begin + timedelta(seconds=WALL_SECONDS[value])
    berlin = ZoneInfo('Europe/Berlin')
    need(FIRST_DAY <= begin.date().isoformat() <= LAST_DAY
         and FIRST_DAY <= finish.date().isoformat() <= LAST_DAY
         and FIRST_DAY <= begin.astimezone(berlin).date().isoformat() <= LAST_DAY
         and FIRST_DAY <= finish.astimezone(berlin).date().isoformat() <= LAST_DAY)
    if value == 'mock500':
        need(begin.date() == finish.date()
             and begin.astimezone(berlin).date() == finish.astimezone(berlin).date())
    return {'resourceContract': CONTRACT, 'stage': value, 'maximumWallSeconds': WALL_SECONDS[value],
            'processingSeconds': PROCESSING_SECONDS[value], 'startedAtUTC': begin.isoformat(),
            'maximumCompletionUTC': finish.isoformat(), 'executionAuthority': False}
