"""Only capability-probe boundaries; no runner mutation or previous test repeat."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import stat
import subprocess
from types import SimpleNamespace
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('w15_runner_probe', Path(__file__).with_name('runner_preflight.py'))
P = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(P)


class PreflightChecks(unittest.TestCase):
    def invoke(self, argv):
        with contextlib.redirect_stdout(io.StringIO()) as output:
            code = P.main(argv)
        return code, json.loads(output.getvalue())

    def test_fixed_commands_discard_stderr_environment_and_bound_time(self):
        with patch.object(P.subprocess, 'run', return_value=SimpleNamespace(returncode=0, stdout=b'systemd 2\n')) as run:
            self.assertEqual(P.query(P.DOCKER), 'systemd 2')
        argv, kwargs = run.call_args
        self.assertEqual(argv, (P.DOCKER,))
        self.assertIn('-P', P.IDENTITY)
        self.assertEqual(P.DOCKER[:6], P.IDENTITY[:6])
        self.assertEqual(kwargs['timeout'], 10)
        self.assertEqual(kwargs['env'], P.ENV)
        self.assertEqual(kwargs['stderr'], subprocess.DEVNULL)
        self.assertEqual(kwargs['stdin'], subprocess.DEVNULL)
        self.assertIs(kwargs['shell'], False)
        with patch.object(P.subprocess, 'run', side_effect=AssertionError('must not launch')):
            with self.assertRaises(ValueError):
                P.query(('docker', 'run', 'forbidden'))

    def test_failed_malformed_oversized_and_timed_out_outputs_are_unknown(self):
        for value in (SimpleNamespace(returncode=1, stdout=b'PRIVATE'),
                      SimpleNamespace(returncode=0, stdout=b'\xffPRIVATE'),
                      SimpleNamespace(returncode=0, stdout=b'x' * 4097)):
            with patch.object(P.subprocess, 'run', return_value=value):
                self.assertIsNone(P.query(P.SYSTEMD))
        with patch.object(P.subprocess, 'run', side_effect=subprocess.TimeoutExpired('PRIVATE', 10)):
            self.assertIsNone(P.query(P.SYSTEMD))

    def test_observed_capabilities_never_accept_bootstrap_memory_restore_or_start(self):
        def query(argv):
            return {P.SYSTEMD: '255.4', P.IDENTITY + ('-u',): '1000',
                    P.IDENTITY + ('-g',): '1000', P.DOCKER: 'systemd 2'}[argv]
        socket = SimpleNamespace(st_mode=stat.S_IFSOCK | 0o660, st_uid=0)
        with patch.object(P.platform, 'system', return_value='Linux'), \
                patch.object(P, 'cgroup_interfaces', return_value=P.PASS), \
                patch.object(P.Path, 'read_text', return_value='systemd\n'), \
                patch.object(P.Path, 'lstat', return_value=socket), \
                patch.object(P, 'query', side_effect=query), \
                patch.object(P.os, 'statvfs', return_value=SimpleNamespace(f_bavail=123, f_frsize=4096)):
            code, result = self.invoke(['--observe-runner-only', '--runner-temp', '/invented/runner'])
        self.assertEqual(code, 0)
        self.assertTrue(result['capabilitiesObserved'])
        self.assertEqual(result['observedFreeDiskBytes'], 123 * 4096)
        self.assertEqual(result['readiness'], 'BLOCKED')
        self.assertEqual(result['authCalls'], 0)
        for key in ('commonBootstrapObserved', 'uidConversionPerformed', 'fullRestoreCapacityAccepted',
                    'commonLifetimeMemoryAccepted', 'executionAuthority', 'testStarted',
                    'end500Acceptance', 'mock500Acceptance'):
            self.assertIs(result[key], False)
        self.assertNotIn('/invented', json.dumps(result))

    def test_unknown_probe_and_invalid_arguments_never_leak_details_or_succeed(self):
        with patch.object(P, 'observe', side_effect=RuntimeError('/private/SECRET')):
            code, result = self.invoke(['--observe-runner-only', '--runner-temp', '/private/SECRET'])
        self.assertEqual(code, 1)
        self.assertEqual(result['checks'], {'probeCompleted': 'UNKNOWN'})
        self.assertNotIn('SECRET', json.dumps(result))
        for argv in ([], ['--help'], ['--observe-runner', '--runner-temp', '/tmp'],
                     ['--observe-runner-only', '--runner-temp', 'relative/SECRET'],
                     ['--run', '/private/SECRET']):
            with patch.object(P, 'observe', side_effect=AssertionError('must reject arguments')):
                code, result = self.invoke(argv)
            self.assertEqual(code, 1)
            self.assertEqual(result['readiness'], 'BLOCKED')
            self.assertNotIn('SECRET', json.dumps(result))

    def test_wrong_uid_driver_or_socket_and_unknown_disk_keep_probe_blocked(self):
        def query(argv):
            return {P.SYSTEMD: None, P.IDENTITY + ('-u',): '1001',
                    P.IDENTITY + ('-g',): None, P.DOCKER: 'cgroupfs 2'}[argv]
        socket = SimpleNamespace(st_mode=stat.S_IFSOCK | 0o666, st_uid=0)
        with patch.object(P.platform, 'system', return_value='Linux'), \
                patch.object(P, 'cgroup_interfaces', return_value=P.UNKNOWN), \
                patch.object(P.Path, 'read_text', return_value='systemd\n'), \
                patch.object(P.Path, 'lstat', return_value=socket), \
                patch.object(P, 'query', side_effect=query), \
                patch.object(P.os, 'statvfs', side_effect=OSError('SECRET')):
            code, result = self.invoke(['--observe-runner-only', '--runner-temp', '/invented/runner'])
        self.assertEqual(code, 1)
        self.assertFalse(result['capabilitiesObserved'])
        self.assertEqual(result['checks']['sudoObservedUID1000'], 'FAIL')
        self.assertEqual(result['checks']['sudoObservedGID1000'], 'UNKNOWN')
        self.assertEqual(result['checks']['uid1000LocalDockerSystemdCgroupV2'], 'FAIL')
        self.assertEqual(result['checks']['rootOwnedRestrictedDockerSocket'], 'FAIL')
        self.assertEqual(result['checks']['runnerTempFilesystemObserved'], 'UNKNOWN')
        self.assertIsNone(result['observedFreeDiskBytes'])
        self.assertNotIn('SECRET', json.dumps(result))

    def test_kernel_interfaces_require_unified_memory_peak_and_swap(self):
        fixture = {'/proc/self/cgroup': '0::/job\n', '/sys/fs/cgroup/cgroup.controllers': 'cpu memory',
                   '/sys/fs/cgroup/job/memory.peak': '123', '/sys/fs/cgroup/job/memory.swap.max': 'max'}
        def read(path):
            return fixture[str(path)]
        with patch.object(P.Path, 'read_text', read):
            self.assertEqual(P.cgroup_interfaces(), P.PASS)
            fixture['/proc/self/cgroup'] = '0::/../private\n'
            self.assertEqual(P.cgroup_interfaces(), P.FAIL)
            fixture['/proc/self/cgroup'] = '2:memory:/job\n'
            self.assertEqual(P.cgroup_interfaces(), P.FAIL)
            fixture['/proc/self/cgroup'] = '0::/job\n'
            fixture['/sys/fs/cgroup/job/memory.peak'] = 'unknown'
            self.assertEqual(P.cgroup_interfaces(), P.UNKNOWN)


if __name__ == '__main__':
    unittest.main()
