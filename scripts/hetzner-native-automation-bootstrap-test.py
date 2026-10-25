"""Focused synthetic bootstrap tests. No root, network, subprocess, or GPG.

Run with scripts/hetzner-native-automation-tests.py.
The exact public source is pinned and read with O_NOFOLLOW|O_NOATIME.
Every bootstrap API/filesystem boundary exercised below is mocked.
"""
from contextlib import ExitStack
import copy
import hashlib
import io
import json
import os
from pathlib import Path
import stat
import sys
import types
import unittest
from unittest.mock import Mock, patch


from helmut_native_test_support import load_source, read_noatime

m = load_source('bootstrap')
COMMIT = 'a' * 40
OTHER = 'b' * 40
NONCE = 'c' * 64
GO = m.PLAN
SENTINEL = 'SYNTHETIC_PRIVATE_STDERR_MUST_NEVER_LEAK'
SOURCE = ("NATIVE_GO_PLAN_SHA256 = '" + GO + "'\n"
          "def handle(value, context):\n"
          "    context['stdin'].on_handle(value, context)\n"
          "    return {'ok': True}\n").encode('ascii')
PAYLOAD = hashlib.sha256(SOURCE).hexdigest()


def request_value(operation='status', nonce=NONCE, payload=PAYLOAD):
    return {'schema': 'helmut-native-control-request-v1', 'operation': operation,
            'nonce': nonce, 'plan_sha256': m.PLAN, 'payload_sha256': payload}


_DEFAULT = object()

def wire(value=_DEFAULT):
    return m.canonical(request_value() if value is _DEFAULT else value) + b'\n'


class FocusCase(unittest.TestCase):
    def setUp(self):
        m.STATE.clear()
        m.STATE.update(phase='entry', nonce=None, trusted=False)

    def assert_stop(self, code, function, *args):
        with self.assertRaises(m.Stop) as raised:
            function(*args)
        self.assertEqual(raised.exception.code, code)


class RequestTests(FocusCase):
    def test_exact_schema_and_all_fixed_operations(self):
        for operation in m.OPERATIONS:
            with self.subTest(operation=operation):
                value = request_value(operation)
                stream = io.BytesIO(wire(value) + b'NEXT_FRAME')
                self.assertEqual(m.request(stream), value)
                self.assertEqual(stream.read(), b'NEXT_FRAME')

    def test_line_exact_limit_and_missing_delimiter(self):
        original = wire()
        exact = original[:-1] + b' ' * (8192 - len(original)) + b'\n'
        self.assertEqual(len(exact), 8192)
        self.assertEqual(m.request(io.BytesIO(exact)), request_value())
        for data in (exact[:-1] + b' \n', original.rstrip(b'\n'), b'', b'x' * 8193 + b'\n'):
            with self.subTest(length=len(data)):
                self.assert_stop('REQUEST_LIMIT_OR_DELIMITER', m.request, io.BytesIO(data))
        stream = Mock()
        stream.readline.return_value = original
        self.assertEqual(m.request(stream), request_value())
        stream.readline.assert_called_once_with(8193)

    def test_exact_fields_and_json_object_required(self):
        for value in ([], None, 7, 'text', {**request_value(), 'extra': 1},
                      {k: v for k, v in request_value().items() if k != 'nonce'}):
            with self.subTest(value=value):
                self.assert_stop('REQUEST_FIELDS', m.request, io.BytesIO(wire(value)))
        for raw in (b'{invalid}\n', b'\xff\n'):
            with self.assertRaises((ValueError, UnicodeError)):
                m.request(io.BytesIO(raw))

    def test_duplicate_fields_rejected(self):
        raw = wire()[:-2] + b',"nonce":"' + NONCE.encode() + b'"}\n'
        self.assert_stop('DUPLICATE_REQUEST_FIELD', m.request, io.BytesIO(raw))

    def test_schema_operation_and_hex_binding_exact(self):
        for key, value, code in [('schema', 'other', 'REQUEST_OPERATION'),
                                 ('operation', 'STATUS', 'REQUEST_OPERATION'),
                                 ('operation', '--shell', 'REQUEST_OPERATION'),
                                 ('operation', 1, 'REQUEST_OPERATION'),
                                 ('plan_sha256', '0' * 64, 'REQUEST_BINDING')]:
            with self.subTest(key=key, value=value):
                self.assert_stop(code, m.request, io.BytesIO(wire({**request_value(), key: value})))
        for key in ('nonce', 'payload_sha256'):
            for value in ('A' * 64, 'a' * 63, 'a' * 65, 'g' * 64, 'a' * 63 + '\n', None, 1, True):
                with self.subTest(key=key, value=value):
                    self.assert_stop('REQUEST_BINDING', m.request,
                                     io.BytesIO(wire({**request_value(), key: value})))

    def test_canonical_json_is_stable_ascii(self):
        self.assertEqual(m.canonical({'z': '\u00e4', 'a': 1}), b'{"a":1,"z":"\\u00e4"}')


class ApiTests(FocusCase):
    def test_api_and_main_commit_exact_identity(self):
        with patch.object(m, 'get', return_value=b'{"ok":true}') as get:
            self.assertEqual(m.api('fixed/path'), {'ok': True})
            get.assert_called_once_with('https://api.github.com/repos/' + m.REPO + '/fixed/path')
        for object_value, expected in [({'type': 'commit', 'sha': COMMIT}, COMMIT),
                                       ({'type': 'tag', 'sha': COMMIT}, None),
                                       ({'type': 'commit', 'sha': 'A' * 40}, None),
                                       ({'type': 'commit', 'sha': COMMIT + '0'}, None)]:
            with self.subTest(value=object_value), patch.object(m, 'api', return_value={'object': object_value}) as api:
                if expected:
                    self.assertEqual(m.main_commit(), expected)
                else:
                    self.assert_stop('MAIN_IDENTITY', m.main_commit)
                api.assert_called_once_with('git/ref/heads/main')

    def test_network_wrapper_is_mocked_bounded_and_no_redirect(self):
        url = 'https://api.github.com/repos/' + m.REPO + '/fixed'
        response = Mock()
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        response.geturl.return_value = url
        response.read.return_value = b'abc'
        with patch.object(m.urllib.request, 'urlopen', return_value=response) as opening, \
             patch.object(m.time, 'monotonic', return_value=100):
            m.STATE['deadline'] = 400
            self.assertEqual(m.get(url, 3), b'abc')
            self.assertEqual(opening.call_args.kwargs['timeout'], 20)
            response.read.assert_called_with(4)
            m.STATE['deadline'] = 105
            self.assertEqual(m.get(url, 3), b'abc')
            self.assertEqual(opening.call_args.kwargs['timeout'], 5)
            response.geturl.return_value = url + '/redirect'
            self.assert_stop('SOURCE_REDIRECT', m.get, url, 3)
            response.geturl.return_value = url
            response.read.return_value = b'abcd'
            self.assert_stop('SOURCE_SIZE_LIMIT', m.get, url, 3)
            opening.reset_mock()
            m.STATE['deadline'] = 99
            self.assert_stop('CONTROL_DEADLINE', m.get, url, 3)
            opening.assert_not_called()
            self.assert_stop('UNAPPROVED_SOURCE', m.get, 'https://evil.invalid/' + m.REPO, 3)
            opening.assert_not_called()


class CITests(FocusCase):
    def setUp(self):
        super().setUp()
        checks = []
        self.mapping = {}
        for index, name in enumerate(m.CHECKS):
            check_id, job_id = 101 + index, 201 + index
            checks.append({'id': check_id, 'name': name, 'head_sha': COMMIT,
                           'status': 'completed', 'conclusion': 'success',
                           'app': {'id': 15368, 'slug': 'github-actions'},
                           'check_suite': {'id': 70},
                           'details_url': 'https://github.com/' + m.REPO + '/actions/runs/41/job/' + str(job_id)})
            self.mapping['actions/jobs/' + str(job_id)] = {
                'id': job_id, 'run_id': 41, 'head_sha': COMMIT, 'name': name,
                'status': 'completed', 'conclusion': 'success',
                'check_run_url': 'https://api.github.com/repos/' + m.REPO + '/check-runs/' + str(check_id)}
            if index == 0:
                self.mapping['actions/jobs/' + str(job_id)]['steps'] = [
                    {'name': m.BOUNDARY_STEP, 'status': 'completed', 'conclusion': 'success'}]
        self.mapping['commits/' + COMMIT + '/check-runs?per_page=100'] = {'total_count': 2, 'check_runs': checks}
        self.mapping['actions/runs/41'] = {
            'id': 41, 'head_sha': COMMIT, 'head_branch': 'main', 'path': '.github/workflows/ci.yml',
            'event': 'push', 'status': 'completed', 'conclusion': 'success', 'check_suite_id': 70,
            'repository': {'full_name': m.REPO}}
        self.rows = checks
        self.run = self.mapping['actions/runs/41']
        self.job = self.mapping['actions/jobs/201']

    def qualify(self):
        with patch.object(m, 'api', side_effect=lambda path: copy.deepcopy(self.mapping[path])) as api:
            value = m.qualify_ci(COMMIT)
            self.assertEqual(sum(call.args == ('actions/runs/41',) for call in api.call_args_list), 1)
            return value

    def test_only_two_mandatory_checks_need_green(self):
        self.rows.append({'id': 900, 'name': 'Optional AI review', 'conclusion': 'failure'})
        self.mapping['commits/' + COMMIT + '/check-runs?per_page=100']['total_count'] = 3
        self.assertEqual(self.qualify(), {name: {'check_id': 101 + n, 'run_id': 41}
                                         for n, name in enumerate(m.CHECKS)})

    def test_check_name_and_app_identity_exact(self):
        for field, value in [('name', 'syntax + offline-suiten'), ('app', {'id': 1, 'slug': 'github-actions'}),
                             ('app', {'id': 15368, 'slug': 'other'})]:
            original = self.rows[0][field]
            with self.subTest(field=field, value=value):
                self.rows[0][field] = value
                self.assert_stop('REQUIRED_CHECK_MISSING', self.qualify)
            self.rows[0][field] = original

    def test_check_commit_status_and_conclusion_exact(self):
        for field, value in [('head_sha', OTHER), ('status', 'in_progress'),
                             ('conclusion', 'neutral'), ('conclusion', 'SUCCESS')]:
            original = self.rows[0][field]
            with self.subTest(field=field, value=value):
                self.rows[0][field] = value
                self.assert_stop('REQUIRED_CHECK_NOT_GREEN', self.qualify)
            self.rows[0][field] = original

    def test_latest_required_rerun_failure_overrules_old_success(self):
        latest = copy.deepcopy(self.rows[0])
        latest.update(id=999, conclusion='failure')
        self.rows.append(latest)
        self.assert_stop('REQUIRED_CHECK_NOT_GREEN', self.qualify)

    def test_check_details_url_requires_exact_repo_run_job_shape(self):
        for url in ['https://github.com/other/repo/actions/runs/41/job/201',
                    'http://github.com/' + m.REPO + '/actions/runs/41/job/201',
                    self.rows[0]['details_url'] + '?query=1',
                    'https://github.com/' + m.REPO + '/actions/runs/no/job/201']:
            with self.subTest(url=url):
                self.rows[0]['details_url'] = url
                self.assert_stop('CI_RUN_IDENTITY', self.qualify)

    def test_workflow_commit_main_path_push_and_success_exact(self):
        for field, value in [('head_sha', OTHER), ('head_branch', 'refs/heads/main'),
                             ('head_branch', 'feature'), ('path', '.github/workflows/other.yml'),
                             ('event', 'pull_request'), ('status', 'queued'), ('conclusion', 'neutral'),
                             ('repository', {'full_name': 'other/repo'})]:
            original = self.run[field]
            with self.subTest(field=field, value=value):
                self.run[field] = value
                self.assert_stop('UNTRUSTED_CI_WORKFLOW', self.qualify)
            self.run[field] = original

    def test_suite_id_exact_and_integer(self):
        for value in (71, '70', None, True):
            with self.subTest(value=value):
                self.run['check_suite_id'] = value
                self.assert_stop('CI_SUITE_BINDING', self.qualify)

    def test_job_id_run_commit_name_check_url_and_conclusion_exact(self):
        changes = [('id', 202), ('id', '201'), ('run_id', 42), ('head_sha', OTHER),
                   ('name', m.CHECKS[1]), ('status', 'queued'), ('conclusion', 'neutral'),
                   ('check_run_url', 'https://api.github.com/repos/' + m.REPO + '/check-runs/102')]
        for field, value in changes:
            original = self.job[field]
            with self.subTest(field=field, value=value):
                self.job[field] = value
                self.assert_stop('CI_JOB_CHECK_BINDING', self.qualify)
            self.job[field] = original

    def test_native_boundary_step_must_run_exactly_once_and_pass(self):
        successful = {'name': m.BOUNDARY_STEP, 'status': 'completed', 'conclusion': 'success'}
        cases = [
            ('missing-field', None),
            ('missing-step', []),
            ('wrong-name', [{**successful, 'name': m.BOUNDARY_STEP + ' '}]),
            ('skipped', [{**successful, 'conclusion': 'skipped'}]),
            ('not-completed', [{**successful, 'status': 'in_progress'}]),
            ('failed', [{**successful, 'conclusion': 'failure'}]),
            ('neutral', [{**successful, 'conclusion': 'neutral'}]),
            ('duplicate', [successful, dict(successful)]),
        ]
        original = copy.deepcopy(self.job['steps'])
        for label, steps in cases:
            with self.subTest(case=label):
                if steps is None:
                    self.job.pop('steps', None)
                else:
                    self.job['steps'] = copy.deepcopy(steps)
                self.assert_stop('NATIVE_BOUNDARY_CHECK_NOT_PASSED', self.qualify)
            self.job['steps'] = copy.deepcopy(original)
        # The browser job does not own this syntax/offline boundary step.
        self.assertNotIn('steps', self.mapping['actions/jobs/202'])
        self.assertEqual(set(self.qualify()), set(m.CHECKS))

    def test_unproven_or_paginated_check_listing_fails(self):
        key = 'commits/' + COMMIT + '/check-runs?per_page=100'
        for value in ({'check_runs': []}, {'check_runs': [], 'total_count': 101},
                      {'check_runs': None, 'total_count': 0}):
            with self.subTest(value=value):
                self.mapping[key] = value
                self.assert_stop('CI_LIST_UNPROVEN', self.qualify)


class ServeHarness:
    def __init__(self, case, operation='status', source=SOURCE, payload=None, nonce=NONCE):
        self.case, self.source = case, source
        self.value = request_value(operation, nonce, hashlib.sha256(source).hexdigest() if payload is None else payload)
        self.stream = io.BytesIO(wire(self.value))
        self.files, self.events = {}, []
        def handling(value, context):
            self.events.append(('handler', value['operation']))
            context['stdin'].handled = context
        self.stream.on_handle = handling
        self.stack = ExitStack()

    def __enter__(self):
        def bind(target, name, **kwargs):
            return self.stack.enter_context(patch.object(target, name, **kwargs))
        for name in ('getuid', 'geteuid', 'getgid', 'getegid'):
            bind(m.os, name, return_value=0)
        bind(m.os, 'environ', new={'HELMUT_REQUEST_COMMAND': 'helmut-native-control-v1'})
        bind(m.os, 'umask', return_value=0o077)
        self.trusted = bind(m, 'trusted_dir', return_value=77)
        bind(m.os, 'fstat', return_value=types.SimpleNamespace(st_mode=stat.S_IFDIR | 0o700))
        bind(m.os, 'close', side_effect=lambda fd: self.events.append(('close', fd)))
        def opening(path, flags, *args, **kwargs):
            self.case.assertEqual(path, '/proc/sys/kernel/random/boot_id')
            self.case.assertTrue(flags & os.O_NOFOLLOW)
            self.case.assertTrue(flags & os.O_NOATIME)
            return 78
        bind(m.os, 'open', side_effect=opening)
        bind(m.os, 'fdopen', side_effect=lambda fd, mode: io.StringIO('synthetic-boot\n'))
        def reading(path, limit):
            self.events.append(('read', path))
            if path == m.BASE + '/POLICY.SAFE.json':
                return m.canonical({'plan_sha256': m.PLAN, 'boot_id': 'synthetic-boot', 'native_go_authority_sha256': GO})
            return self.files[path]
        self.reading = bind(m, 'read_file', side_effect=reading)
        def writing(path, data):
            self.events.append(('write', path))
            if path in self.files:
                raise FileExistsError(path)
            self.files[path] = data
        self.writing = bind(m, 'write_once', side_effect=writing)
        self.commit = bind(m, 'main_commit', side_effect=[COMMIT, COMMIT])
        self.ci = bind(m, 'qualify_ci', return_value={name: {'check_id': n} for n, name in enumerate(m.CHECKS)})
        def fetching(url, limit):
            self.case.assertEqual(url, 'https://raw.githubusercontent.com/' + m.REPO + '/' + COMMIT + '/' + m.MODULE)
            self.case.assertEqual(limit, 131072)
            return self.source
        bind(m, 'get', side_effect=fetching)
        bind(m.time, 'time', return_value=2000000000)
        bind(m.time, 'monotonic', return_value=100)
        return self

    def __exit__(self, *args):
        return self.stack.__exit__(*args)


class ServeTests(FocusCase):
    def test_wrong_protocol_rejected_before_any_io_or_deadline(self):
        for protocol in (None, '', 'helmut-native-control-v2', 'helmut-native-control-v1 '):
            with self.subTest(protocol=protocol), ExitStack() as stack:
                for name in ('getuid', 'geteuid', 'getgid', 'getegid'):
                    stack.enter_context(patch.object(m.os, name, return_value=0))
                stack.enter_context(patch.object(m.os, 'environ', {} if protocol is None else {'HELMUT_REQUEST_COMMAND': protocol}))
                forbidden = []
                for target, name in [(m.os, 'umask'), (m.os, 'open'), (m.os, 'fstat'),
                                     (m.time, 'monotonic'), (m, 'trusted_dir'), (m, 'read_file'),
                                     (m, 'write_once'), (m, 'request'), (m, 'main_commit'), (m, 'get')]:
                    forbidden.append(stack.enter_context(patch.object(target, name, side_effect=AssertionError('IO_FORBIDDEN'))))
                stream = Mock()
                self.assert_stop('SSH_COMMAND_REJECTED', m.serve, stream)
                for call in forbidden:
                    call.assert_not_called()
                self.assertEqual(stream.mock_calls, [])
                self.assertNotIn('deadline', m.STATE)

    def test_success_response_binding_deadline_and_state(self):
        with ServeHarness(self) as h:
            encoded = m.serve(h.stream)
            response = json.loads(encoded)
            self.assertEqual(response['schema'], 'helmut-native-control-response-v1')
            for field in ('nonce', 'operation', 'plan_sha256', 'payload_sha256'):
                self.assertEqual(response[field], h.value[field])
            self.assertEqual(response['result_sha256'], hashlib.sha256(m.canonical(response['result'])).hexdigest())
            self.assertEqual(h.files[m.BASE + '/results/' + NONCE + '.json'], encoded)
            self.assertTrue(m.STATE['trusted'])
            self.assertEqual(m.STATE['nonce'], NONCE)
            self.assertEqual(m.STATE['phase'], 'handler')
            self.assertEqual(m.STATE['deadline'], 400)
            self.assertEqual(h.stream.handled['deadline'], 400)
            self.assertEqual(h.stream.handled['source_sha256'], PAYLOAD)
            self.assertEqual(h.stream.handled['deployment_commit'], COMMIT)
            self.assertEqual(h.stream.handled['once_directory'], m.BASE + '/once')

    def test_source_hash_and_main_drift_fail_before_deployment_or_handler(self):
        for drift in (False, True):
            with self.subTest(drift=drift), ServeHarness(self, payload=PAYLOAD if drift else '0' * 64) as h:
                if drift:
                    h.commit.side_effect = [COMMIT, OTHER]
                self.assert_stop('MAIN_CHANGED_DURING_QUALIFICATION' if drift else 'DEPLOYMENT_SOURCE_HASH', m.serve, h.stream)
                self.assertEqual(set(h.files), {m.BASE + '/requests/' + NONCE + '.json'})
                self.assertFalse(hasattr(h.stream, 'handled'))
                self.assertEqual(m.STATE['phase'], 'deployment-ci')

    def test_nonce_receipt_prevents_second_attempt_before_api(self):
        with ServeHarness(self) as h:
            h.files[m.BASE + '/requests/' + NONCE + '.json'] = b'EXISTING'
            with self.assertRaises(FileExistsError):
                m.serve(h.stream)
            h.commit.assert_not_called()
            h.ci.assert_not_called()
            self.assertEqual(h.files[m.BASE + '/requests/' + NONCE + '.json'], b'EXISTING')

    def test_four_tx_go_ledger_is_independent_of_module_version(self):
        with ServeHarness(self, operation='four-tx') as h:
            m.serve(h.stream)
            path = m.BASE + '/once/' + GO + '.json'
            self.assertIn(path, h.files)
            self.assertNotIn('/deployments/', path)
            self.assertNotEqual(PAYLOAD, GO)
            self.assertNotIn(PAYLOAD, path)
            ledger = json.loads(h.files[path])
            self.assertEqual(ledger['go'], GO)
            self.assertEqual(ledger['state'], 'CONSUMED_BEFORE_HANDLER')
            self.assertLess(h.events.index(('write', path)), h.events.index(('handler', 'four-tx')))
            self.assertLess(h.events.index(('write', path)), h.events.index(('write', m.BASE + '/results/' + NONCE + '.json')))
            previous = h.files[path]
            h.source = SOURCE + b'\n# distinct reviewed module version\n'
            second_nonce = 'e' * 64
            second = request_value('four-tx', second_nonce, hashlib.sha256(h.source).hexdigest())
            h.commit.side_effect = [COMMIT, COMMIT]
            stream = io.BytesIO(wire(second))
            with self.assertRaises(FileExistsError):
                m.serve(stream)
            self.assertFalse(hasattr(stream, 'handled'))
            self.assertEqual(h.files[path], previous)
            self.assertEqual([p for p in h.files if '/once/' in p], [path])

    def test_four_tx_requires_qualified_go_before_handler(self):
        invalid = b"NATIVE_GO_PLAN_SHA256 = 'NOT-A-HASH'\ndef handle(v,c):\n c['stdin'].handled=True\n return {}\n"
        with ServeHarness(self, operation='four-tx', source=invalid) as h:
            self.assert_stop('NATIVE_GO_NOT_QUALIFIED', m.serve, h.stream)
            self.assertFalse(hasattr(h.stream, 'handled'))
            self.assertFalse(any('/once/' in path for path in h.files))

    def test_main_saves_sanitized_first_error_before_response_and_keeps_it(self):
        with ServeHarness(self) as h:
            m.STATE.update(trusted=True, nonce=NONCE, phase='handler')
            stdout_text, stdout_bytes = io.StringIO(), io.BytesIO()
            def output(value):
                h.events.append(('stdout', value))
                return stdout_text.write(value)
            stdout = types.SimpleNamespace(write=output, flush=lambda: None, buffer=stdout_bytes)
            stderr = io.StringIO()
            failure = RuntimeError(SENTINEL)
            failure.code = 'unsafe ' + SENTINEL
            with patch.object(m, 'serve', side_effect=failure), patch.object(m.sys, 'stdout', stdout), \
                 patch.object(m.sys, 'stderr', stderr), patch.object(m.sys, 'stdin', types.SimpleNamespace(buffer=h.stream)):
                status = m.main()
                self.assertEqual(status, 1)
                first_path = m.BASE + '/results/' + NONCE + '.FIRST_ERROR.SAFE.json'
                first = h.files[first_path]
                self.assertLess(h.events.index(('write', first_path)), next(n for n, e in enumerate(h.events) if e[0] == 'stdout'))
                first_response = json.loads(stdout_text.getvalue())
                self.assertTrue(first_response['first_error_saved'])
                self.assertEqual(first_response['code'], 'BOOTSTRAP_FAILURE')
                stdout_text.seek(0); stdout_text.truncate()
                self.assertEqual(m.main(), 1)
            self.assertEqual(h.files[first_path], first)
            saved = json.loads(first)
            self.assertEqual(saved['code'], 'BOOTSTRAP_FAILURE')
            self.assertEqual(saved['phase'], 'handler')
            self.assertEqual(saved['exception_type'], 'RuntimeError')
            self.assertNotIn(SENTINEL, first.decode() + stdout_text.getvalue() + stderr.getvalue())
            self.assertEqual(stdout_bytes.getvalue(), b'')


class FileHelperTests(FocusCase):
    def test_write_once_is_exclusive_and_fsyncs_file_then_directory(self):
        events = []
        with patch.object(m, 'trusted_dir', return_value=77) as trusted, \
             patch.object(m.os, 'open', return_value=88) as opening, \
             patch.object(m.os, 'write', side_effect=[1, 2]) as writing, \
             patch.object(m.os, 'fsync', side_effect=lambda fd: events.append(('fsync', fd))), \
             patch.object(m.os, 'close', side_effect=lambda fd: events.append(('close', fd))):
            m.write_once(m.BASE + '/results/fake.json', b'abc')
            trusted.assert_called_once_with(m.BASE + '/results')
            args, kwargs = opening.call_args
            self.assertEqual(args[0], 'fake.json')
            self.assertTrue(args[1] & os.O_EXCL)
            self.assertTrue(args[1] & os.O_NOFOLLOW)
            self.assertEqual(args[2], 0o600)
            self.assertEqual(kwargs, {'dir_fd': 77})
            self.assertEqual([c.args for c in writing.call_args_list], [(88, b'abc'), (88, b'bc')])
            self.assertEqual(events, [('fsync', 88), ('close', 88), ('fsync', 77), ('close', 77)])

    def test_read_file_uses_nofollow_noatime_metadata_and_exact_bound(self):
        metadata = types.SimpleNamespace(st_mode=stat.S_IFREG | 0o600, st_uid=0, st_gid=0, st_nlink=1)
        with patch.object(m.os, 'open', return_value=88) as opening, \
             patch.object(m.os, 'fstat', return_value=metadata), patch.object(m.os, 'dup', return_value=89), \
             patch.object(m.os, 'fdopen', side_effect=lambda fd, mode: io.BytesIO(b'abc')), \
             patch.object(m.os, 'close'):
            self.assertEqual(m.read_file('/SYNTHETIC', 3), b'abc')
            flags = opening.call_args.args[1]
            self.assertTrue(flags & os.O_NOFOLLOW)
            self.assertTrue(flags & os.O_NOATIME)
            self.assert_stop('FILE_CHANGED_OR_TOO_LARGE', m.read_file, '/SYNTHETIC', 2)
            metadata.st_uid = 1000
            self.assert_stop('UNTRUSTED_FILE', m.read_file, '/SYNTHETIC', 3)


if __name__ == '__main__':
    unittest.main(verbosity=2)
