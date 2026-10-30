"""Execute only the actual End500 readiness fragment with fictional servers.

No main import, Docker, PostgreSQL, original input or 500-profile execution.
"""
import sys
sys.dont_write_bytecode = True

import ast
import copy
from pathlib import Path
import subprocess
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, call


SOURCE = Path(__file__).absolute().parent.parent / 'synthetik-500-w15-memory-forward.py'


def readiness_fragment():
    tree = ast.parse(SOURCE.read_bytes())
    function = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'main')
    loops = [node for node in ast.walk(function) if isinstance(node, ast.For)
             and any(isinstance(child, ast.Constant) and child.value == 'pg_isready'
                     for child in ast.walk(node))]
    if len(loops) != 1:
        raise AssertionError('expected-single-actual-readiness-loop')
    loop = loops[0]
    siblings = next(value for parent in ast.walk(function) for _, value in ast.iter_fields(parent)
                    if isinstance(value, list) and loop in value)
    check = siblings[siblings.index(loop) + 1]
    if not isinstance(check, ast.Assert) or not isinstance(check.msg, ast.Constant) \
            or check.msg.value != 'w15-forward-pg-readiness':
        raise AssertionError('expected-actual-readiness-check')
    module = ast.Module(body=[copy.deepcopy(loop), copy.deepcopy(check)], type_ignores=[])
    return compile(ast.fix_missing_locations(module), '<actual-end500-readiness-fragment>', 'exec')


class FictionalInitThenFinalServer:
    """Official-image init accepts Unix sockets before final TCP is ready."""
    def __init__(self, tcp_ready_after=None, returns=None, error=None):
        self.tcp_ready_after, self.returns, self.error = tcp_ready_after, returns, error
        self.calls, self.transports = [], []

    def run(self, argv, **kwargs):
        self.calls.append((argv, kwargs))
        tcp = '-h' in argv and argv[argv.index('-h') + 1] == '127.0.0.1'
        self.transports.append('tcp' if tcp else 'temporary-init-unix-socket')
        if self.error is not None:
            raise self.error
        ready = not tcp or self.tcp_ready_after is not None and len(self.calls) >= self.tcp_ready_after
        result = self.returns if self.returns is not None else 0 if ready else 1
        return subprocess.CompletedProcess(argv, result)


class End500TCPReadinessChecks(unittest.TestCase):
    def setUp(self):
        self.code = readiness_fragment()
        self.sleep = Mock()

    def invoke(self, server):
        self.environment = {'FICTIONAL_PUBLIC_ENV': 'only'}
        namespace = {'M': SimpleNamespace(DOCKER=['FICTIONAL_DOCKER'], ENV=self.environment),
            'CONTAINER': 'FICTIONAL_CONTAINER',
            'subprocess': SimpleNamespace(run=server.run, DEVNULL=subprocess.DEVNULL),
            'time': SimpleNamespace(sleep=self.sleep)}
        exec(self.code, namespace)

    def test_temporary_socket_success_does_not_pass_before_final_tcp_server(self):
        server = FictionalInitThenFinalServer(tcp_ready_after=3)
        self.invoke(server)
        self.assertEqual(server.transports, ['tcp'] * 3)
        self.assertEqual(self.sleep.call_args_list, [call(.2), call(.2)])

    def test_socket_only_init_exhausts_existing_budget_without_passing(self):
        server = FictionalInitThenFinalServer()
        with self.assertRaisesRegex(AssertionError, '^w15-forward-pg-readiness$'):
            self.invoke(server)
        self.assertEqual(server.transports, ['tcp'] * 100)
        self.assertEqual(self.sleep.call_count, 100)

    def test_genuine_final_tcp_ready_keeps_existing_command_limits_and_suppression(self):
        server = FictionalInitThenFinalServer(tcp_ready_after=1)
        self.invoke(server)
        self.assertEqual(len(server.calls), 1)
        argv, kwargs = server.calls[0]
        self.assertEqual(argv, ['FICTIONAL_DOCKER', 'exec', 'FICTIONAL_CONTAINER',
                               'pg_isready', '-h', '127.0.0.1', '-U', 'postgres'])
        self.assertEqual(kwargs, {'env': self.environment, 'stdout': subprocess.DEVNULL,
                                  'stderr': subprocess.DEVNULL, 'timeout': 5})
        self.sleep.assert_not_called()

    def test_poll_timeout_propagates_without_retry_or_false_success(self):
        failure = subprocess.TimeoutExpired(['FICTIONAL_DOCKER'], 5)
        server = FictionalInitThenFinalServer(error=failure)
        with self.assertRaises(subprocess.TimeoutExpired) as caught:
            self.invoke(server)
        self.assertIs(caught.exception, failure)
        self.assertEqual(len(server.calls), 1)
        self.sleep.assert_not_called()

    def test_nonzero_or_signalled_poll_never_reports_readiness(self):
        for code in (1, 2, -15):
            with self.subTest(returncode=code):
                server = FictionalInitThenFinalServer(returns=code)
                with self.assertRaisesRegex(AssertionError, '^w15-forward-pg-readiness$'):
                    self.invoke(server)
                self.assertEqual(len(server.calls), 100)


if __name__ == '__main__': unittest.main()
