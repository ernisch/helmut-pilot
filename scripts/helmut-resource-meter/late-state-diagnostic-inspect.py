#!/usr/bin/env python3
"""Read existing admission rules only. No start, reservation or remote call."""
import argparse
import datetime
import hashlib
import json
import os
import types
from pathlib import Path

BIN = Path(__file__).resolve().parent
SOURCE_HASHES = {
    'native-memory-budget.py': '66b4c432f687445763074a6b2432533c9305cadc09a17a94bf45507d419fd4af',
    'start-preflight.py': '8f99c74de4e9df817d27247605c82ae7f8bc5008d8533a14ae95f767428e11ee',
}
RUNTIME = Path('/workspace/helmut-ram-fix-20261020/architecture-correction-20261020/'
               'native-budget-implementation-qualification-v2/runtime/RUNTIME.SAFE.json')


def load_verified(name):
    path = BIN / name
    data = path.read_bytes()
    if path.is_symlink() or hashlib.sha256(data).hexdigest() != SOURCE_HASHES[name]:
        raise RuntimeError('reviewed admission source differs')
    module = types.ModuleType(name.replace('-', '_'))
    module.__file__ = str(path)
    # Execute only these verified bytes; never load/create a local .pyc file.
    exec(compile(data, str(path), 'exec'), module.__dict__)
    return module


def inspect():
    native = load_verified('native-memory-budget.py')
    preflight = load_verified('start-preflight.py')
    runtime = json.loads(RUNTIME.read_text())
    native.validate_runtime(runtime, actual=False)  # No Docker call.
    stat = os.statvfs('/workspace')
    available = stat.f_bavail * stat.f_frsize
    floor = 8 * 1024**3
    component_required = floor + 16 * 1024**2
    component_error = None
    try:
        observed = native.small_setup_capacity()  # Actual, unchanged entry guard.
        component_allowed = True
    except RuntimeError as error:
        observed = None
        component_allowed = False
        component_error = str(error)
    hulls = preflight.NEW_CONTAINER_COUNT * (
        2 * preflight.PINNED_IMAGE_BYTES + preflight.NEW_CONTAINER_OVERHEAD_BYTES)
    hulls += 2 * (2 * runtime['imageBytes'] + preflight.NEW_CONTAINER_OVERHEAD_BYTES)
    full_required = 2 * 1024**3 + floor + hulls + preflight.RETAINED_OUTPUT_BUDGET_BYTES
    return {
        'schema': 'helmut-late-state-diagnostic-inspection/1',
        'atUTC': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'status': ('REQUIRES_FRESH_ADOPTION_AND_SOURCE_BINDING' if component_allowed
                   else 'BLOCKED_COMPONENT_DISK_ADMISSION'),
        'availableBytes': available, 'hostFreeFloorBytes': floor,
        'marginAboveFloorBytes': available - floor,
        'nativeComponentRequiredBytes': component_required,
        'nativeComponentShortfallBytes': max(0, component_required - available),
        'unchangedNativeEntryGuardAccepted': component_allowed,
        'entryGuardObservedAvailableBytes': observed, 'entryGuardError': component_error,
        'fullRunRequiredBytesForExisting2GiBStorage': full_required,
        'fullRunShortfallBytes': max(0, full_required - available),
        'fullRunStorageBytes': 2 * 1024**3,
        'nativePolicy': native.policy(), 'policyInstalledOrChanged': False,
        'fullStartCheckCount': len(preflight.REQUIRED_CHECKS),
        'fullStartRequiredReviewModel': 'deepseek-v4-pro',
        'fullStartRequiredReviewEffort': 'high',
        'reviewRequirementSource': 'start-preflight.py:coverage_adopted',
        'sourceSHA256': SOURCE_HASHES,
        'runtimePin': native.pin(RUNTIME),
        'actualRuntimeOrOriginalsRequalified': False,
        'containersCreatedOrStarted': 0, 'sqlStatementsExecuted': 0,
        'nativeBudgetStartCalled': False, 'reservationOrGOConsumed': False,
        'full500Authorized': False, 'production': False, 'modelCalls': 0,
        'limits': ['A positive capacity observation never authorizes a run.',
                   'No alternative filesystem or reserved root blocks are substituted.',
                   'Full-run source, time, originals, independent acceptance and GO stay mandatory.'],
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--inspect', action='store_true', required=True)
    parser.parse_args()
    result = inspect()
    print(json.dumps(result, indent=2))
    raise SystemExit(0 if result['unchangedNativeEntryGuardAccepted'] else 2)
