"""Tiny real terminal-Pipe checks; no container, DB, original or network work."""
import sys
sys.dont_write_bytecode = True
import importlib.util
import json
import multiprocessing
from pathlib import Path
import time
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

HERE = Path(__file__).absolute().parent
CANARY = 'FICTIONAL_PRIVATE_MESSAGE_SQL_PATH_MUST_NOT_ESCAPE'


def load(name):
    spec = importlib.util.spec_from_file_location('materials_terminal_' + name, HERE / (name + '.py'))
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


R, W, M = load('mock500_runner'), load('mock500_workflow'), load('mock500_materials_contract')
D = R.S.D


def first(**changes):
    return {'schema': 'helmut-w15-materials-first-failure/1',
            'category': 'MATERIALS_BINDING_CHECK_123', 'kind': 'assertion', 'stage': 'calendar', **changes}


def terminal(phase='mock500-controller-materials-calendar', detail=None):
    error = RuntimeError(CANARY)
    error.phase, error.materials_failure = phase, M.failure(first() if detail is None else detail)
    return R.S._worker_failure(error, 'WORKER_RESULT_REJECTED', error_type=R.MockRunnerError)


def public_roundtrip(error, *, malformed=None):
    packet = R.S._failure_packet(error)
    if malformed is not None:
        packet['runner'] = {**packet.get('runner', {'reason': 'WORKER_REPORTED_FAILURE'}),
                            'materialsFailure': malformed}
    # Exercise the existing bounded OS Pipe reader, not a second error channel.
    receiver, sender = multiprocessing.Pipe(duplex=False)
    try:
        raw = R.S._encode(packet, R.S.MAX_RESULT)
        sender.send_bytes(raw)
        observed = R.S._read_worker_response(receiver, time.monotonic() + 2,
                                              error_type=R.MockRunnerError)
    finally:
        sender.close(); receiver.close()
    result = W._safe_failure(R._failure(observed))
    assert CANARY not in json.dumps(result)
    return {'status': 'FAIL_OR_BLOCKED_MOCK500_WORKFLOW', **result,
            'executionAuthority': False, 'retryAllowed': False}


def public_fixtures():
    rows = [public_roundtrip(terminal())]
    for suffix in ('processing', 'command', 'fixtures', 'audit'):
        detail = first(category='MATERIALS_PROCESS_REJECTED', kind='filesystem', stage='output')
        rows.append(public_roundtrip(terminal('mock500-controller-materials-copy-' + suffix, detail)))
    return rows


class MaterialsTerminalChecks(unittest.TestCase):
    def test_node_and_four_copy_failures_cross_existing_real_pipe_and_public_projection(self):
        for row in public_fixtures():
            self.assertEqual(row['runner']['reason'], 'WORKER_REPORTED_FAILURE')
            self.assertEqual(D.materials_failure(row['runner']['materialsFailure']), row['runner']['materialsFailure'])
            self.assertIn(row['worker']['phase'], R.WORKER_PHASES)
            self.assertFalse(row['executionAuthority'])
            self.assertFalse(row['retryAllowed'])

    def test_pure_validator_matches_existing_contract_and_rejects_private_optional_fields(self):
        good = [first(kind=k) for k in M.KINDS] + [first(stage=s) for s in M.STAGES]
        good += [first(category='MATERIALS_MAIN_CHECK_' + str(n).zfill(3))
                 for n in (1, 9, 10, 99, 100, 999, 1000, 1019, 1020, 1024)]
        good += [first(category=c) for c in ('MATERIALS_ENTRY_REJECTED', 'MATERIALS_PROCESS_REJECTED',
                                          'MATERIALS_PROCESS_TIMEOUT', 'MATERIALS_FAILURE_UNAVAILABLE')]
        for value in good:
            self.assertEqual(D.materials_failure(value), M.failure(value))
        bad = [None, [], CANARY, {}, {**first(), 'raw': CANARY}, first(kind=CANARY), first(stage=CANARY),
               first(schema=CANARY), first(category=CANARY), first(category=[]),
               first(category='MATERIALS_MAIN_CHECK_001\n')]
        bad += [first(category='MATERIALS_MAIN_CHECK_' + str(n).zfill(3)) for n in (0, 1025, 9999)]
        for value in bad:
            with self.subTest(value=type(value).__name__):
                self.assertIsNone(D.materials_failure(value))
                with self.assertRaises(ValueError): M.failure(value)
                # Malformed optional details cannot discard the established phase.
                if value is not None:
                    row = public_roundtrip(terminal(), malformed=value)
                    self.assertEqual(row['worker']['phase'], 'mock500-controller-materials-calendar')
                    self.assertEqual(row['runner'], {'reason': 'WORKER_REPORTED_FAILURE'})

    def test_worker_projection_requires_known_phase_and_never_reloads_original_checkout(self):
        with patch.object(importlib.util, 'spec_from_file_location', side_effect=PermissionError(CANARY)):
            error = terminal()
            self.assertEqual(error.runner['materialsFailure'], first())
        class BadAttribute(RuntimeError):
            phase = 'mock500-controller-materials'
            @property
            def materials_failure(self): raise RuntimeError(CANARY)
        failure = R.S._worker_failure(BadAttribute(CANARY), 'WORKER_RESULT_REJECTED', error_type=R.MockRunnerError)
        self.assertEqual(failure.worker_phase, 'mock500-controller-materials')
        self.assertNotIn('materialsFailure', failure.runner or {})
        unknown = RuntimeError(CANARY); unknown.phase = CANARY; unknown.materials_failure = first()
        failure = R.S._worker_failure(unknown, 'WORKER_RESULT_REJECTED', error_type=R.MockRunnerError)
        self.assertIsNone(failure.worker_phase)
        self.assertNotIn('materialsFailure', failure.runner or {})

    def test_late_cleanup_error_and_signal_preserve_first_materials_failure(self):
        initial = terminal()
        latch = SimpleNamespace(seen=False, cleaning=False)
        def close():
            latch.seen = True
            raise OSError(CANARY)
        latch.close = close
        listener = Mock(); listener.close.side_effect = OSError(CANARY)
        with patch.object(R.S, '_command', side_effect=AssertionError('NO_PROCESS_COMMAND_ALLOWED')):
            stopped = R.S._cleanup_launch({}, None, None, False, None, listener, latch, initial,
                                          error_type=R.MockRunnerError)
        self.assertIs(stopped, initial)
        row = public_roundtrip(stopped)
        self.assertEqual(row['worker']['phase'], 'mock500-controller-materials-calendar')
        self.assertEqual(row['runner']['materialsFailure'], first())
        self.assertEqual(row['runner']['secondaryReason'], 'SIGNAL_DURING_CLEANUP')
        self.assertEqual(row['cleanup']['launcherListenerClosed'], 'UNKNOWN')
        self.assertEqual(row['cleanup']['launcherSignalsRestored'], 'UNKNOWN')


if __name__ == '__main__':
    if sys.argv[1:] == ['--public-fixtures']:
        print(json.dumps(public_fixtures()))
    else:
        unittest.main()
