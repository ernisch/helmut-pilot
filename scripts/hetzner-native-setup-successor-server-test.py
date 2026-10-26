"""Isolated capsule/loader/watchdog checks. No target, SSH or external source I/O."""
import contextlib
import hashlib
import io
import json
import os
from pathlib import Path
import time
import types
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).with_name('hetzner-native-automation-server.py')
fd = os.open(SOURCE, os.O_RDONLY | os.O_NOFOLLOW | os.O_NOATIME)
with os.fdopen(fd, 'rb') as handle:
    RAW = handle.read()
M = types.ModuleType('successor_server_synthetic')
exec(compile(RAW, str(SOURCE), 'exec'), M.__dict__)


def encoded(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False) + '\n').encode('ascii')


class SuccessorServerTests(unittest.TestCase):
    def setUp(self):
        now = int(time.time())
        self.capsule = {'schema': 'helmut-setup-successor-capsule-v1',
            'contract_id': M.SETUP_SUCCESSOR_ID, 'action': 'inspect', 'phase': None,
            'source_sha256': 'b'*64, 'contract_sha256': 'c'*64, 'nonce': 'd'*64,
            'inspection_nonce': None, 'inspection_result_sha256': None,
            'issued_at_utc': now, 'expires_at_utc': now+240}
        self.raw = encoded(self.capsule)
        self.request = {'schema': 'helmut-native-control-request-v1', 'operation': 'status',
            'nonce': hashlib.sha256(b'helmut-setup-successor-request-v1\0'+self.raw).hexdigest(),
            'plan_sha256': M.STAGE_PLAN, 'payload_sha256': 'b'*64}
        self.context = {'base': M.TARGET_BASE, 'source_sha256': 'b'*64,
            'deployment_commit': 'a'*40, 'deadline': time.monotonic()+200,
            'stdin': io.BytesIO(self.raw)}

    def test_optional_line_is_canonical_closed_and_not_a_legacy_fallback(self):
        self.assertEqual(M._setup_read_capsule(self.context), self.capsule)
        for raw in (b'\n', b'{}', b'{}\n', self.raw+b'\n', self.raw+self.raw,
                    self.raw.replace(b'"nonce":', b'"unknown":'),
                    self.raw.replace(b'"nonce":', b'"nonce":"e","nonce":'),
                    self.raw.replace(b'false', b'NaN'), b'x'*8193):
            if raw == self.raw:
                continue
            with self.subTest(raw=raw[:60]), self.assertRaises(Exception):
                M._setup_read_capsule({**self.context, 'stdin': io.BytesIO(raw)})
        self.assertIsNone(M._setup_read_capsule({**self.context, 'stdin': io.BytesIO(b'')}))
        self.assertIsNone(M._setup_read_capsule({k:v for k,v in self.context.items() if k != 'stdin'}))

    def test_real_buffered_stdin_preserves_bootstrap_prefetch_and_blocking_mode(self):
        read_end, write_end = os.pipe()
        os.write(write_end, b'{"synthetic":"bootstrap-header"}\n'+self.raw)
        os.close(write_end)
        with os.fdopen(read_end, 'rb') as stream:
            self.assertEqual(stream.readline(), b'{"synthetic":"bootstrap-header"}\n')
            self.assertTrue(os.get_blocking(stream.fileno()))
            self.assertEqual(M._setup_read_capsule({**self.context, 'stdin': stream}), self.capsule)
            self.assertTrue(os.get_blocking(stream.fileno()))

    def test_open_stdin_without_eof_stops_at_deadline_without_effect(self):
        read_end, write_end = os.pipe()
        try:
            os.write(write_end, self.raw)
            with os.fdopen(read_end, 'rb') as stream:
                started = time.monotonic()
                with self.assertRaises(M._Stop) as caught:
                    M._setup_read_capsule({**self.context, 'deadline': started+.08, 'stdin': stream})
                self.assertEqual(caught.exception.code, 'SETUP_CAPSULE_DEADLINE')
                self.assertLess(time.monotonic()-started, .6)
                self.assertTrue(os.get_blocking(stream.fileno()))
        finally:
            os.close(write_end)

    def test_exact_body_hash_and_operation_are_required_before_watchdog(self):
        result = M._setup_successor_failure('SYNTHETIC_STOP', self.capsule)
        with patch.object(M, '_setup_watchdog', return_value=result) as run:
            self.assertEqual(M.handle(self.request, self.context), result)
            self.assertEqual(run.call_args.kwargs, {'successor_capsule': self.capsule})
        for change in ({'nonce':'e'*64}, {'operation':'admit'}):
            with self.subTest(change=change), patch.object(M, '_setup_watchdog') as run:
                with self.assertRaises(M._Stop):
                    M.handle({**self.request, **change},
                             {**self.context, 'stdin':io.BytesIO(self.raw)})
                run.assert_not_called()
        for key, value in (('source_sha256','e'*64), ('action','setup')):
            body = encoded({**self.capsule, key:value})
            with self.subTest(key=key), patch.object(M, '_setup_watchdog') as run:
                with self.assertRaises(M._Stop):
                    M.handle(self.request, {**self.context, 'stdin':io.BytesIO(body)})
                run.assert_not_called()

    def test_legacy_status_and_admit_never_create_an_implicit_successor(self):
        with patch.object(M, '_setup_watchdog', return_value={'synthetic':'legacy'}) as run:
            answer = M.handle({**self.request, 'operation':'admit'},
                             {**self.context, 'stdin':io.BytesIO(b'')})
            self.assertEqual(answer, {'synthetic':'legacy'})
            self.assertEqual(run.call_args.kwargs, {})

    def test_fixed_same_commit_loader_uses_every_pin_and_exact_context(self):
        library, preflight = b'LIBRARY = True\n', b'PREFLIGHT = True\n'
        coordinator = (b'def coordinate_successor(request, context, capsule, contract, library, preflight):\n'
            b'    assert set(context)=={"base","source_sha256","deployment_commit","deadline"}\n'
            b'    assert library["LIBRARY"] and preflight["PREFLIGHT"]\n'
            b'    return {"native_qualified":False,"native_go_consumed":False,"status":"SYNTHETIC"}\n')
        sha = lambda raw: hashlib.sha256(raw).hexdigest()
        manifest = encoded({'server_sha256':'b'*64, 'coordinator_sha256':sha(coordinator)})
        rows = {M.SETUP_SUCCESSOR_CONTRACT: manifest,
            'scripts/hetzner-native-setup-coordinator.py':library,
            'scripts/hetzner-native-setup-successor-preflight.py':preflight,
            'scripts/hetzner-native-setup-successor.py':coordinator}
        calls = []
        def source(commit, path, deadline, limit, expected_sha=None, expected_bytes=None):
            self.assertEqual(commit, 'a'*40)
            self.assertEqual(deadline, self.context['deadline'])
            raw = rows[path]
            self.assertLessEqual(len(raw),limit)
            if path != M.SETUP_SUCCESSOR_CONTRACT:
                self.assertEqual((sha(raw), len(raw)), (expected_sha, expected_bytes))
            else:
                self.assertIsNone(expected_sha); self.assertIsNone(expected_bytes)
            calls.append(path)
            return raw
        with contextlib.ExitStack() as stack:
            for name, value in {'SETUP_COORDINATOR_SHA256':sha(library),
                'SETUP_COORDINATOR_BYTES':len(library),
                'SETUP_SUCCESSOR_COORDINATOR_SHA256':sha(coordinator),
                'SETUP_SUCCESSOR_COORDINATOR_BYTES':len(coordinator),
                'SETUP_SUCCESSOR_PREFLIGHT_SHA256':sha(preflight),
                'SETUP_SUCCESSOR_PREFLIGHT_BYTES':len(preflight)}.items():
                stack.enter_context(patch.object(M,name,value))
            stack.enter_context(patch.object(M,'_setup_public_source',side_effect=source))
            self.assertEqual(M._setup_successor_handle(self.request,self.context,self.capsule)['status'],'SYNTHETIC')
            self.assertEqual(set(calls),set(rows))
            rows[M.SETUP_SUCCESSOR_CONTRACT] = encoded({'server_sha256':'e'*64,
                'coordinator_sha256':sha(coordinator)})
            with self.assertRaises(M._Stop):
                M._setup_successor_handle(self.request,self.context,self.capsule)
        self.assertLessEqual(len(RAW),131072)

    def test_loader_has_no_caller_selected_path_or_unpinned_program(self):
        for path, pin, size in (('https://example.invalid/code.py',None,None),
                              ('scripts/unreviewed.py','a'*64,1),
                              ('scripts/hetzner-native-setup-successor.py',None,None),
                              (M.SETUP_SUCCESSOR_CONTRACT,'a'*64,1)):
            with self.subTest(path=path), patch.object(M.http.client,'HTTPSConnection') as connection:
                with self.assertRaises(M._Stop):
                    M._setup_public_source('a'*40,path,self.context['deadline'],128,pin,size)
                connection.assert_not_called()

    def test_successor_watchdog_never_publishes_into_historical_error(self):
        space = types.SimpleNamespace(f_bavail=10*1024**3, f_frsize=1)
        with patch.object(M,'_setup_successor_qualified',return_value=True), \
             patch.object(M,'_setup_first_failure') as historical, \
             patch.object(M.os,'statvfs',return_value=space):
            with patch.object(M,'_setup_successor_handle',return_value={
                    'schema':'helmut-setup-successor-inspection-v1','status':'INSPECTED_NOT_ADMITTED',
                    'native_qualified':False,'native_go_consumed':False}):
                answer = M._setup_watchdog(self.request,self.context,successor_capsule=self.capsule)
                self.assertEqual(answer['status'],'INSPECTED_NOT_ADMITTED')
            def fail(*args):
                raise M._Stop('SYNTHETIC_CHILD_STOP')
            with patch.object(M,'_setup_successor_handle',side_effect=fail):
                answer = M._setup_watchdog(self.request,self.context,successor_capsule=self.capsule)
                self.assertEqual(answer['code'],'SYNTHETIC_CHILD_STOP')
                self.assertEqual(answer['contract_sha256'],self.capsule['contract_sha256'])
            def stall(*args):
                time.sleep(1)
            with patch.object(M,'_setup_successor_handle',side_effect=stall):
                started = time.monotonic()
                answer = M._setup_watchdog(self.request,{**self.context,'deadline':started+.08},
                                          successor_capsule=self.capsule)
                self.assertEqual(answer['status'],'FAIL_KEEP_STATE_NO_RETRY')
                self.assertLess(time.monotonic()-started,.8)
            historical.assert_not_called()
            self.assertTrue(all(answer[k] is None for k in ('authority_sha256','attempt_sha256',
                'ready_sha256','accepted_sha256','lifecycle_sha256')))


if __name__ == '__main__':
    unittest.main(verbosity=2)
