"""Pure codec-runner checks only. No subprocess, Docker, PG or native query."""
import contextlib
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import signal
import sys
import tempfile
import types
import unittest
from unittest import mock

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent


def load():
    spec = importlib.util.spec_from_file_location('registry_codec_offline', HERE / 'local-unit-native-registry-codec.py')
    loaded = importlib.util.module_from_spec(spec); spec.loader.exec_module(loaded)
    return loaded


def probe():
    return {'schema': 'helmut-native-registry-json-codec/1', 'serverVersionNum': 170006,
            'oidJSON': '1', 'oidJSONType': 'string', 'bigintJSON': 1, 'bigintJSONType': 'number',
            'explicitProjectionMatches': True, 'maxOIDPreserved': True, 'qualifiedBooleanTypeMatches': True}


class Child:
    def __init__(self, *, exit_code=0, timeout=False):
        self.returncode = None; self.exit_code = exit_code; self.timeout = timeout; self.calls = []

    def poll(self): return self.returncode
    def send_signal(self, sig): self.calls.append(('signal', sig))
    def terminate(self): self.calls.append(('terminate',))
    def kill(self): self.calls.append(('kill',)); self.exit_code = -9
    def wait(self, *, timeout):
        self.calls.append(('wait', timeout))
        if self.timeout and timeout == 35: raise TimeoutError('simulated-close-timeout')
        self.returncode = self.exit_code; return self.returncode


class CodecChecks(unittest.TestCase):
    def setUp(self): self.m = load()

    def test_default_and_help_never_reach_workload_or_import_helpers(self):
        for args in ([], ['--help']):
            with (mock.patch.object(self.m, 'host_main') as host, mock.patch.object(self.m, 'worker_main') as worker,
                  mock.patch.object(self.m, 'module') as importer):
                with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                    with self.assertRaises(SystemExit): self.m.main(args)
                host.assert_not_called(); worker.assert_not_called(); importer.assert_not_called()

    def test_explicit_flag_and_isolated_runtime_required(self):
        flags = types.SimpleNamespace(isolated=False, no_site=False, dont_write_bytecode=True)
        with mock.patch.object(self.m, 'sys', types.SimpleNamespace(flags=flags)), mock.patch.object(self.m, 'host_main') as host:
            with contextlib.redirect_stdout(io.StringIO()): self.assertEqual(self.m.main(['--qualify-native-read-codec']), 1)
            host.assert_not_called()
        flags.isolated = flags.no_site = True
        with mock.patch.object(self.m, 'sys', types.SimpleNamespace(flags=flags)), mock.patch.object(self.m.signal, 'signal'), mock.patch.object(self.m, 'host_main', return_value=0) as host:
            self.assertEqual(self.m.main(['--qualify-native-read-codec']), 0); host.assert_called_once_with()

    def test_worker_cannot_run_without_fixed_config_digest(self):
        flags = types.SimpleNamespace(isolated=True, no_site=True, dont_write_bytecode=True)
        with mock.patch.object(self.m, 'sys', types.SimpleNamespace(flags=flags)), mock.patch.object(self.m, 'worker_main') as worker:
            with contextlib.redirect_stdout(io.StringIO()): self.assertEqual(self.m.main(['--codec-worker']), 1)
            worker.assert_not_called()

    def test_only_exact_actual_pg17_codec_is_accepted(self):
        self.assertEqual(self.m.validate_probe(probe()), probe())
        for key, value in [('serverVersionNum', True), ('serverVersionNum', 170005), ('oidJSON', 1), ('oidJSONType', 'number'),
                           ('bigintJSON', True), ('bigintJSON', '1'), ('bigintJSONType', 'string'), ('explicitProjectionMatches', False), ('maxOIDPreserved', False), ('qualifiedBooleanTypeMatches', False)]:
            wrong = probe(); wrong[key] = value
            with self.assertRaises(RuntimeError): self.m.validate_probe(wrong)
        wrong = probe(); wrong['qualified'] = True
        with self.assertRaises(RuntimeError): self.m.validate_probe(wrong)

    def test_captures_are_bounded_unique_json_and_utf8(self):
        for raw in (b'{"x":1,"x":2}', b'\xff', b'NaN', b' ' * (1024**2 + 1)):
            with self.assertRaises((RuntimeError, ValueError)): self.m.unique_json(raw)

    def test_fd_pin_and_compilation_use_exact_same_bytes(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'closed.py'; path.write_text('VALUE = 19\n')
            _, pin = self.m.source_bytes(path)
            loaded, got = self.m.module(path, pin)
            self.assertEqual(loaded.VALUE, 19); self.assertEqual(got, pin)
            path.write_text('VALUE = 20\n')
            with self.assertRaises(RuntimeError): self.m.module(path, pin)
            link = Path(temp) / 'alias.py'; link.symlink_to(path)
            with self.assertRaises(RuntimeError): self.m.source_bytes(link)

    def config(self):
        return {'case': '/workspace/codec-case', 'nonce': 'a' * 32, 'parent': 'helmut-meter-memorybudget-' + 'b' * 24,
                'runtime': {'imageId': 'sha256:' + 'c' * 64}, 'python': '/opt/native/python/bin/python3.12'}

    def test_container_has_one_persistent_writable_bind_and_small_ram(self):
        c = self.config()
        mounts = [(Path(c['case']), '/bench', False), (Path('/workspace/code'), '/workspace/code', True)]
        args = self.m.container_arguments(c, mounts, 'd' * 64)
        self.assertIn('type=bind,src=/workspace/codec-case,dst=/bench', args)
        self.assertIn('type=bind,src=/workspace/code,dst=/workspace/code,readonly', args)
        self.assertIn('/ram:' + self.m.RAM_OPTIONS, args)
        for flag, value in [('--user', '1000:1000'), ('--network', 'none'), ('--cgroupns', 'private'),
                            ('--shm-size', '16777216'), ('--cap-drop', 'ALL'), ('--security-opt', 'no-new-privileges')]:
            self.assertEqual(args[args.index(flag) + 1], value)
        self.assertNotIn('image.raw', ' '.join(args)); self.assertNotIn('/var/run/docker.sock', ' '.join(args))
        self.assertNotIn('/ram/PGDATA', str(self.m.DATA)); self.assertEqual(self.m.DATA.parent, Path('/bench'))
        for bad in (mounts + [(Path('/workspace/other'), '/other', False)], mounts + [mounts[1]], mounts + [(Path('/workspace/x'), '/ram', True)]):
            with self.assertRaises(RuntimeError): self.m.container_arguments(c, bad, 'd' * 64)

    def worker(self, temp, child, *, eof=True, overflow=False):
        row = {'label': 'POSTGRES_CODEC', 'data': bytearray(b'database system is shut down\n'), 'eof': eof,
               'overflow': overflow, 'error': None, 'thread': mock.Mock()}
        row['thread'].is_alive.return_value = False
        return types.SimpleNamespace(OUT=Path(temp), CHILDREN=[child], LOGS=[row]), row

    def test_shutdown_requires_real_zero_sigint_and_eof(self):
        with tempfile.TemporaryDirectory() as temp:
            pg = Child(); worker, row = self.worker(temp, pg)
            result = self.m.close_postgres(worker, pg, row)
            self.assertTrue(result['cleanShutdown'] and result['allChildrenExited'])
            self.assertIn(('signal', signal.SIGINT), pg.calls)
            self.assertEqual((Path(temp) / 'POSTGRES_CODEC.PRIVATE.log').stat().st_mode & 0o777, 0o600)

    def test_shutdown_timeout_wrong_exit_missing_eof_and_log_overflow_never_pass(self):
        for mode in ('timeout', 'wrong-code', 'missing-eof', 'overflow', 'already-exited'):
            with tempfile.TemporaryDirectory() as temp:
                pg = Child(exit_code=1 if mode == 'wrong-code' else 0, timeout=mode == 'timeout')
                if mode == 'already-exited': pg.returncode = 0
                worker, row = self.worker(temp, pg, eof=mode != 'missing-eof', overflow=mode == 'overflow')
                result = self.m.close_postgres(worker, pg, row)
                self.assertFalse(result['cleanShutdown'])
                self.assertTrue(result['allChildrenExited'])

    def test_log_save_failure_cannot_skip_child_cleanup(self):
        with tempfile.TemporaryDirectory() as temp:
            pg, other = Child(), Child(); worker, row = self.worker(temp, pg); worker.CHILDREN.append(other)
            (Path(temp) / 'POSTGRES_CODEC.PRIVATE.log').write_bytes(b'existing')
            result = self.m.close_postgres(worker, pg, row)
            self.assertTrue(result['allChildrenExited']); self.assertFalse(result['cleanShutdown'])
            self.assertIn(('terminate',), other.calls)

    def test_host_close_failure_still_closes_helpers_and_checks_final_group(self):
        with tempfile.TemporaryDirectory() as temp:
            group = Path(temp); c = dict(self.config(), parentDevice=group.stat().st_dev, parentInode=group.stat().st_ino)
            native = mock.Mock(); native.parent_path.return_value = group
            native.close_case_helpers.return_value = {'allKnownHelpersClosed': True}
            ids = ['1' * 64, '2' * 64, '3' * 64]
            rows = [{'Id': cid, 'HostConfig': {'CgroupParent': '/' + c['parent']}} for cid in ids]
            def docker(args, **kwargs):
                return types.SimpleNamespace(stdout='\n'.join(ids) if args[0] == 'ps' else json.dumps(rows) if args[0] == 'inspect' else '0')
            native.docker.side_effect = docker
            kernel = mock.Mock(); kernel.kernel_snapshot.return_value = {'fullLastProcessExitCovered': True}
            budget = {'helpers': {'holder': {'id': ids[1]}, 'setter': {'id': ids[2]}}}
            with mock.patch.object(self.m, 'container_identity', side_effect=RuntimeError('simulated-identity-failure')):
                final, errors = self.m.close_host(mock.Mock(), native, kernel, c, [], 'd' * 64, ids[0], budget)
            self.assertIn('workload-close-failed', errors)
            native.close_case_helpers.assert_called_once()
            kernel.kernel_snapshot.assert_called_once_with(c['parent'], require_empty=True)
            self.assertTrue(any(call.args[0][0] == 'kill' for call in native.docker.call_args_list))
            self.assertTrue(final['fullLastProcessExitCovered'])

    def test_host_rejects_missing_or_foreign_measured_cids(self):
        with tempfile.TemporaryDirectory() as temp:
            group = Path(temp); c = dict(self.config(), parentDevice=group.stat().st_dev, parentInode=group.stat().st_ino)
            native = mock.Mock(); native.parent_path.return_value = group
            native.close_case_helpers.return_value = {'allKnownHelpersClosed': True}
            native.docker.return_value = types.SimpleNamespace(stdout='')
            kernel = mock.Mock(); kernel.kernel_snapshot.return_value = {'fullLastProcessExitCovered': True}
            _, errors = self.m.close_host(mock.Mock(), native, kernel, c, [], 'd' * 64, None,
                                         {'helpers': {'holder': {'id': '1' * 64}, 'setter': {'id': '2' * 64}}})
            self.assertIn('final-kernel-or-cid-closure-failed', errors)

    def test_runtime_provenance_does_not_rebuild_or_replace_original_identity(self):
        source = (HERE / 'local-unit-native-registry-codec.py').read_text()
        for marker in ("single_link=False", "native.validate_runtime(runtime)", "supervisor.bindings()", "native.start(",
                       "worker.capture(", "worker.start_log(", "worker.query('postgres'", "reader.registry_codec_probe_sql()",
                       "kernel.kernel_snapshot(", "native.verify(", "DATA = Path('/bench/PGDATA_CODEC_NOT_ORIGINAL')"):
            self.assertIn(marker, source)
        self.assertNotIn('prepare_runtime(', source); self.assertNotIn('restore_readonly_libraries(', source)
        self.assertNotIn('os.chown(', source); self.assertNotIn('write_text(', source)

    def test_current_reviewed_source_and_unchanged_scalar_sql_are_exactly_bound(self):
        pin = self.m.reviewed_read_closure_pin()
        self.assertEqual(pin['sha256'], self.m.READ_CLOSURE_SHA256)
        self.assertEqual(self.m.HISTORICAL_READ_CLOSURE_SHA256, 'c52a98aea31bff80cd48c6dcda8693cd623f2f3f3601494a8670c71ff971a620')
        self.assertNotEqual(self.m.READ_CLOSURE_SHA256, self.m.HISTORICAL_READ_CLOSURE_SHA256)
        helper, _ = self.m.module(HERE / 'local-unit-native-read-closure.py', pin)
        sql = self.m.codec_query(helper)
        self.assertEqual(hashlib.sha256(sql.encode()).hexdigest(), self.m.REGISTRY_CODEC_SQL_SHA256)
        self.assertEqual(len(sql.encode()), 716)
        self.assertTrue(sql.startswith('BEGIN READ ONLY;'))
        self.assertIn("'maxOIDPreserved'", sql)

    def test_historical_and_other_source_hashes_are_not_accepted_as_fallback(self):
        _, actual = self.m.source_bytes(HERE / 'local-unit-native-read-closure.py')
        for digest in (self.m.HISTORICAL_READ_CLOSURE_SHA256, '0' * 64):
            pin = {**actual, 'sha256': digest}
            with mock.patch.object(self.m, 'source_bytes', return_value=(b'', pin)):
                with self.assertRaisesRegex(RuntimeError, '^native-registry-codec-reviewed-current-read-codec-source$'):
                    self.m.reviewed_read_closure_pin()

    def test_changed_or_nontext_scalar_query_is_rejected_before_native_query(self):
        pin = self.m.reviewed_read_closure_pin()
        helper, _ = self.m.module(HERE / 'local-unit-native-read-closure.py', pin)
        sql = self.m.codec_query(helper)
        for changed in (sql + ' ', sql.replace('BEGIN READ ONLY;', 'BEGIN;', 1), b'not-text', None):
            fake = types.SimpleNamespace(registry_codec_probe_sql=mock.Mock(return_value=changed))
            with self.assertRaisesRegex(RuntimeError, '^native-registry-codec-reviewed-scalar-codec-query$'):
                self.m.codec_query(fake)
            fake.registry_codec_probe_sql.assert_called_once_with()

    def test_failure_output_never_contains_exception_detail(self):
        flags = types.SimpleNamespace(isolated=True, no_site=True, dont_write_bytecode=True)
        output = io.StringIO()
        with mock.patch.object(self.m, 'sys', types.SimpleNamespace(flags=flags)), mock.patch.object(self.m.signal, 'signal'), mock.patch.object(self.m, 'host_main', side_effect=RuntimeError('untrusted-stderr-detail')):
            with contextlib.redirect_stdout(output): self.assertEqual(self.m.main(['--qualify-native-read-codec']), 1)
        value = json.loads(output.getvalue())
        self.assertEqual(value['failureType'], 'RuntimeError'); self.assertNotIn('untrusted-stderr-detail', output.getvalue())
        self.assertFalse(value['codecPass'] or value['unit60Qualified'] or value['full500'] or value['full500ReserveQualified'])


if __name__ == '__main__':
    unittest.main()
