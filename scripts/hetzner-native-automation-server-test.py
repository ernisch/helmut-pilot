#!/usr/bin/env python3
"""Independent synthetic review tests; never start GPG, SSH or target operations."""
import ast
import base64
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
import types
import unittest
from unittest.mock import patch

from helmut_native_test_support import (load_source, read_noatime, source,
                                        RECIPIENT_SHA256)

SERVER_SOURCE = source('server')
SERVER = load_source('server')
CLIENT = load_source('client')
FIXED_PREFIX = ('-i', 'PATH=/usr/bin:/bin', 'LC_ALL=C', '/usr/bin/gpg', '--no-options')


def fixture():
    # Fabricated public packet. GnuPG cryptographic validation is explicitly mocked.
    public = (b'-----BEGIN PGP PUBLIC KEY BLOCK-----\n\n' +
              base64.b64encode(b'\xc6\x01\x04') +
              b'\n=AAAA\n-----END PGP PUBLIC KEY BLOCK-----\n')
    record = {'ok': True, 'phase': 'complete', 'primary_fingerprint': 'A' * 40,
              'primary_expires_unix': int(time.time()) + 3600,
              'subkey_expires_unix': int(time.time()) + 3600,
              'public_key_sha256': hashlib.sha256(public).hexdigest()}
    return public, record


class IndependentServerTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix='independent-native-server-')
        self.addCleanup(self.directory.cleanup)
        self.base_patch = patch.object(SERVER, 'TARGET_BASE', self.directory.name)
        self.base_patch.start()
        self.addCleanup(self.base_patch.stop)
        self.deadline_patch = patch.object(SERVER, '_CONTROL_DEADLINE', None)
        self.deadline_patch.start()
        self.addCleanup(self.deadline_patch.stop)

    def test_leader_already_exited_child_keeps_pipes_open_timeout_kills_own_group(self):
        real_popen, real_killpg = subprocess.Popen, os.killpg
        processes, events = [], []
        script = ('import os,time\n'
                  'child=os.fork()\n'
                  'if child: os._exit(0)\n'
                  'time.sleep(30)\n')

        def only_local_child(arguments, **options):
            self.assertEqual(arguments[:6], ['/usr/bin/env', *FIXED_PREFIX])
            self.assertEqual(options['env'], {'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'LC_ALL': 'C'})
            self.assertTrue(options['start_new_session'])
            self.assertTrue(options['close_fds'])
            self.assertEqual(options['cwd'], self.directory.name)
            process = real_popen([sys.executable, '-I', '-c', script], **options)
            processes.append(process)
            process.wait(timeout=2)  # Leader is definitely gone; child owns open pipes.
            self.assertEqual(process.returncode, 0)
            return process

        def record_diagnostic(output, code):
            events.append(('diagnostic', code))

        def kill_only_test_group(group, sig):
            events.append(('kill', group, sig))
            return real_killpg(group, sig)

        try:
            with patch.object(SERVER.subprocess, 'Popen', side_effect=only_local_child), \
                    patch.object(SERVER, '_first_tool_error', side_effect=record_diagnostic), \
                    patch.object(SERVER.os, 'killpg', side_effect=kill_only_test_group):
                with self.assertRaises(SERVER._Stop) as raised:
                    SERVER._bounded_tool('/usr/bin/env', FIXED_PREFIX, timeout=0.05)
                self.assertEqual(raised.exception.code, 'TOOL_TIMEOUT')
            self.assertEqual(events[0], ('diagnostic', 'TOOL_TIMEOUT'))
            self.assertEqual(events[1], ('kill', processes[0].pid, signal.SIGKILL))
            self.assertEqual(len(events), 2)
        finally:
            for process in processes:
                try:
                    real_killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                process.wait(timeout=2)

    def test_both_streams_are_independently_bounded_and_nonzero_exit_is_recorded(self):
        real_popen = subprocess.Popen
        for stream in ('stdout', 'stderr'):
            script = ('import sys; sys.' + stream + '.buffer.write(b"x"*70000); '
                      'sys.' + stream + '.buffer.flush()')
            def local_child(arguments, **options):
                return real_popen([sys.executable, '-I', '-c', script], **options)
            with self.subTest(stream=stream), \
                    patch.object(SERVER.subprocess, 'Popen', side_effect=local_child), \
                    patch.object(SERVER, '_first_tool_error') as diagnose:
                with self.assertRaises(SERVER._Stop) as raised:
                    SERVER._bounded_tool('/usr/bin/env', FIXED_PREFIX, timeout=2)
                self.assertEqual(raised.exception.code, 'TOOL_OUTPUT_LIMIT')
                self.assertEqual(diagnose.call_args.args[1], 'TOOL_OUTPUT_LIMIT')
        def failed_child(arguments, **options):
            return real_popen([sys.executable, '-I', '-c',
                               'import sys; sys.stderr.write("SYNTHETIC_PRIVATE_ERROR"); sys.exit(7)'], **options)
        with patch.object(SERVER.subprocess, 'Popen', side_effect=failed_child), \
                patch.object(SERVER, '_first_tool_error') as diagnose:
            completed = SERVER._bounded_tool('/usr/bin/env', FIXED_PREFIX, timeout=2)
            self.assertEqual(completed.returncode, 7)
            self.assertEqual(diagnose.call_args.args[1], 'EXIT_7')

    def test_killpg_processlookup_does_not_replace_original_timeout(self):
        real_popen = subprocess.Popen
        processes = []
        def local_child(arguments, **options):
            process = real_popen([sys.executable, '-I', '-c', 'import time; time.sleep(2)'], **options)
            processes.append(process)
            return process
        try:
            with patch.object(SERVER.subprocess, 'Popen', side_effect=local_child), \
                    patch.object(SERVER, '_first_tool_error'), \
                    patch.object(SERVER.os, 'killpg', side_effect=ProcessLookupError):
                with self.assertRaises(SERVER._Stop) as raised:
                    SERVER._bounded_tool('/usr/bin/env', FIXED_PREFIX, timeout=0.05)
                self.assertEqual(raised.exception.code, 'TOOL_TIMEOUT')
        finally:
            for process in processes:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                process.wait(timeout=2)

    def test_first_private_diagnostic_is_0600_bounded_and_never_overwritten(self):
        base = Path(self.directory.name)
        def open_only_local_base(value):
            self.assertEqual(value, self.directory.name)
            return os.open(value, os.O_RDONLY | os.O_DIRECTORY | os.O_NOATIME)
        output = [bytearray(b'PUBLIC_SYNTHETIC_STDOUT'), bytearray(b'PRIVATE_SYNTHETIC_STDERR' * 1000)]
        with patch.object(SERVER, '_open_base', side_effect=open_only_local_base), \
                patch.object(SERVER, '_owned', return_value=True):
            SERVER._first_tool_error(output, 'FIRST')
            path = base / 'GPG_FIRST_TOOL_ERROR.PRIVATE.json'
            before = read_noatime(path)
            SERVER._first_tool_error([bytearray(), bytearray(b'other')], 'SECOND')
            self.assertEqual(read_noatime(path), before)
        self.assertEqual(path.stat().st_mode & 0o777, 0o600)
        record = json.loads(before)
        self.assertEqual(record['code'], 'FIRST')
        self.assertEqual(len(base64.b64decode(record['stderr_prefix_base64'])), 8192)
        self.assertEqual(record['stderr_sha256'], hashlib.sha256(output[1]).hexdigest())
        self.assertEqual(set(p.name for p in base.iterdir()), {'GPG_FIRST_TOOL_ERROR.PRIVATE.json'})

    def test_status_and_recipient_project_exact_client_abi_without_private_paths(self):
        context = {'base': self.directory.name, 'source_sha256': '2' * 64,
                   'deadline': time.monotonic() + 300}
        for operation in ('status', 'recipient'):
            sent = CLIENT.request(operation, '1' * 64, '2' * 64, '3' * 64)
            public, record = fixture()
            with patch.object(SERVER.os.path, 'lexists', return_value=True), \
                    patch.object(SERVER, '_read_public_file', side_effect=[json.dumps(record).encode(), public]) as read, \
                    patch.object(SERVER, 'create_recipient') as create:
                result = SERVER.handle(sent, context)
                create.assert_not_called()
                if operation == 'status':
                    read.assert_not_called()
                else:
                    self.assertEqual([item.args[0] for item in read.call_args_list],
                                     [self.directory.name + '/' + SERVER.RESULT_NAME,
                                      self.directory.name + '/' + SERVER.PUBLIC_NAME])
            reply = dict(sent, schema='helmut-native-control-response-v1', result=result,
                         result_sha256=CLIENT.digest(CLIENT.canonical(result)))
            gpg = subprocess.CompletedProcess([], 0,
                b'pub:-:255:22:0000000000000000:::::::\nfpr:::::::::' + b'A' * 40 + b':\n', b'')
            with patch.object(CLIENT.subprocess, 'run', return_value=gpg):
                self.assertEqual(CLIENT.validate_response(CLIENT.canonical(reply), sent), reply)
            self.assertNotIn('recipient_home', CLIENT.canonical(result).decode())
            self.assertNotIn('PRIVATE', CLIENT.canonical(result).decode())
            self.assertEqual(SERVER._CONTROL_DEADLINE, context['deadline'])

    def test_recipient_missing_creates_once_then_reads_back_public_fixed_files(self):
        public, record = fixture()
        context = {'base': self.directory.name, 'source_sha256': '2' * 64,
                   'deadline': time.monotonic() + 300}
        with patch.object(SERVER.os.path, 'lexists', side_effect=[False, True]), \
                patch.object(SERVER, 'create_recipient', return_value={'ok': True}) as create, \
                patch.object(SERVER, '_read_public_file', side_effect=[
                    json.dumps(record).encode(), public, json.dumps(record).encode(), public]):
            first = SERVER.handle({'operation': 'recipient'}, context)
            second = SERVER.handle({'operation': 'recipient'}, context)
            self.assertEqual(first, second)
            create.assert_called_once_with(self.directory.name, SERVER._bounded_tool)

    def test_unqualified_operations_never_reach_recipient_or_executor(self):
        with patch.object(SERVER, 'create_recipient') as create, \
                patch.object(SERVER, '_bounded_tool') as execute:
            for operation in ('stage', 'admit', 'four-tx', 'update', 'shell'):
                with self.assertRaises(SERVER._Stop) as raised:
                    SERVER.handle({'operation': operation}, {'base': self.directory.name})
                self.assertEqual(raised.exception.code, 'NATIVE_OPERATION_NOT_QUALIFIED')
            create.assert_not_called()
            execute.assert_not_called()

    def test_imports_are_closed_stdlib_and_recipient_helper_is_unchanged(self):
        tree = ast.parse(SERVER_SOURCE)
        imports = {name.name for node in ast.walk(tree) if isinstance(node, ast.Import) for name in node.names}
        self.assertEqual(imports, {'base64', 'hashlib', 'json', 'os', 're', 'stat', 'time',
                                   'selectors', 'subprocess', 'signal', 'types'})
        self.assertFalse(any(isinstance(node, ast.ImportFrom) for node in ast.walk(tree)))
        self.assertNotIn('export-secret', SERVER_SOURCE.decode())
        self.assertNotIn('os.system', SERVER_SOURCE.decode())
        helper = source('recipient')
        self.assertEqual(SERVER_SOURCE.split(b'# Deployment module:', 1)[0].rstrip(), helper)
        self.assertEqual(hashlib.sha256(helper).hexdigest(), RECIPIENT_SHA256)


if __name__ == '__main__':
    print('Independently tested server SHA256: ' + hashlib.sha256(SERVER_SOURCE).hexdigest(), flush=True)
    unittest.main(verbosity=2)
