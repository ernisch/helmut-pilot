"""Only fresh-server readiness and its new closed phases; no DB or originals."""
import sys
sys.dont_write_bytecode = True

import ast
import copy
import importlib.util
from pathlib import Path
import subprocess
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

HERE = Path(__file__).absolute().parent
spec = importlib.util.spec_from_file_location('w15_tcp_fictional_fixture', HERE / 'test_restore_connection.py')
F = importlib.util.module_from_spec(spec); spec.loader.exec_module(F)
R = F.R


class FictionalPostgres:
    """Init accepts sockets immediately; final server accepts TCP later."""
    def __init__(self, tcp_ready_after=None):
        self.tcp_ready_after, self.polls, self.transports = tcp_ready_after, 0, []

    def run(self, argv, **kwargs):
        self.polls += 1
        tcp = '-h' in argv and argv[argv.index('-h') + 1] == '127.0.0.1'
        self.transports.append('tcp' if tcp else 'init-socket')
        ready = not tcp or self.tcp_ready_after is not None and self.polls >= self.tcp_ready_after
        return subprocess.CompletedProcess(argv, 0 if ready else 1)


class TCPReadinessChecks(unittest.TestCase):
    def fixture(self):
        # Reuse only fictional setup helpers; no pre-existing test is executed.
        fixture = F.SameJobConnectionChecks('runTest'); fixture.setUp()
        self.addCleanup(fixture.doCleanups)
        return fixture, fixture.setup_restore()

    def test_primary_waits_for_final_tcp_before_native_failure_and_keeps_phase(self):
        fixture, connection = self.fixture()
        server = FictionalPostgres(tcp_ready_after=3)
        fixture.restore.side_effect = RuntimeError('/FICTIONAL_PRIVATE_NATIVE_ERROR')
        with patch.object(R.subprocess, 'run', side_effect=server.run), patch.object(R.time, 'sleep'):
            with self.assertRaises(R.RestoreConnectionError) as failed:
                connection.restore_only()
        self.assertEqual(server.transports, ['tcp'] * 3)
        self.assertEqual(failed.exception.phase, 'native-restore')
        self.assertNotIn('PRIVATE', str(failed.exception))
        fixture.restore.assert_called_once()
        self.assertFalse(fixture.running)
        fixture.forward.main.assert_not_called()

    def test_primary_socket_only_init_never_dispatches_native_restore(self):
        fixture, connection = self.fixture()
        server = FictionalPostgres()
        with patch.object(R.subprocess, 'run', side_effect=server.run), patch.object(R.time, 'sleep'):
            with self.assertRaises(R.RestoreConnectionError) as failed:
                connection.restore_only()
        self.assertEqual(server.transports, ['tcp'] * 100)
        self.assertEqual(failed.exception.phase, 'readiness')
        fixture.restore.assert_not_called()
        self.assertFalse(fixture.running)

    def test_independent_recovery_uses_actual_poll_loop_for_tcp_and_init_only_cases(self):
        # Execute only the existing recovery readiness fragment. All surrounding
        # GPG/collection/container/native recovery work is intentionally absent.
        tree = ast.parse((HERE / 'restore_backup.py').read_bytes())
        function = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'restore_readback')
        loop = next(node for node in ast.walk(function) if isinstance(node, ast.For)
                    and any(isinstance(child, ast.Constant) and child.value == 'pg_isready' for child in ast.walk(node)))
        siblings = next(value for parent in ast.walk(function) for _, value in ast.iter_fields(parent)
                        if isinstance(value, list) and loop in value)
        check = siblings[siblings.index(loop) + 1]
        program = ast.Module(body=[copy.deepcopy(loop), copy.deepcopy(check)], type_ignores=[])
        code = compile(ast.fix_missing_locations(program), '<fictional-recovery-readiness-fragment>', 'exec')
        def require(value):
            if not value: raise ValueError('FICTIONAL_NOT_READY')
        for ready_after, count in ((3, 3), (None, 100)):
            with self.subTest(tcp_ready_after=ready_after):
                server = FictionalPostgres(ready_after)
                namespace = {'m': SimpleNamespace(DOCKER=['FICTIONAL_DOCKER'], ENV={}),
                    'owned_id': 'FICTIONAL_CONTAINER', 'guard': Mock(), 'require': require,
                    'subprocess': SimpleNamespace(run=server.run, DEVNULL=subprocess.DEVNULL),
                    'time': SimpleNamespace(sleep=Mock())}
                if ready_after is None:
                    with self.assertRaisesRegex(ValueError, 'FICTIONAL_NOT_READY'): exec(code, namespace)
                else:
                    exec(code, namespace)
                self.assertEqual(server.transports, ['tcp'] * count)


if __name__ == '__main__': unittest.main()
