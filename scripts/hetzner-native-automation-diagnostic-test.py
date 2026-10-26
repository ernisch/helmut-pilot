"""Synthetic diagnostic projection tests; no target files, keys or tools are used."""
from contextlib import ExitStack
import base64
import copy
import hashlib
import io
import json
import os
import stat
import types
import unittest
from unittest.mock import patch

from helmut_native_test_support import load_source

SERVER = load_source('server')
CLIENT = load_source('client')
SENTINEL = 'SYNTHETIC_PRIVATE_DIAGNOSTIC_MUST_NEVER_APPEAR'


def encoded(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':')).encode('ascii')


def recipient_error():
    return {'schema': 'helmut-recipient-v1', 'ok': False, 'phase': 'generate',
            'private_material_exported': False,
            'first_error': {'phase': 'generate', 'code': 'TOOL_EXIT_NONZERO'},
            'first_error_recorded': True, 'recipient_home': '/DO-NOT-READ/' + SENTINEL}


def gpg_error(prefix=None, code='EXIT_2'):
    stderr = (SENTINEL + '\n').encode() if prefix is None else prefix
    return {'code': code, 'stdout_sha256': '1' * 64,
            'stderr_sha256': hashlib.sha256(stderr).hexdigest(),
            'stderr_prefix_base64': base64.b64encode(stderr).decode('ascii')}


class DiagnosticTests(unittest.TestCase):
    def project(self, recipient=None, gpg=None):
        paths = [SERVER.TARGET_BASE + '/' + SERVER.ERROR_NAME,
                 SERVER.TARGET_BASE + '/GPG_FIRST_TOOL_ERROR.PRIVATE.json']
        fixtures = {paths[0]: FileNotFoundError() if recipient is None else recipient,
                    paths[1]: FileNotFoundError() if gpg is None else gpg}
        def read(path, limit):
            self.assertIn(path, paths)
            self.assertEqual(limit, SERVER.MAX_TOOL_OUTPUT)
            value = fixtures[path]
            if isinstance(value, BaseException):
                raise value
            return value
        with ExitStack() as stack:
            reading = stack.enter_context(patch.object(SERVER, '_read_public_file', side_effect=read))
            forbidden = []
            for owner, name in ((SERVER, 'create_recipient'), (SERVER, '_bounded_tool'),
                                (SERVER, '_write_new'), (SERVER, '_json_new'),
                                (SERVER.os, 'open'), (SERVER.subprocess, 'Popen'),
                                (SERVER.subprocess, 'run')):
                forbidden.append(stack.enter_context(patch.object(
                    owner, name, side_effect=AssertionError('diagnostic must only project fixed reads'))))
            result = SERVER._recipient_diagnostic()
            self.assertCountEqual([call.args[0] for call in reading.call_args_list], paths)
            for operation in forbidden:
                operation.assert_not_called()
        self.assertEqual(set(result), {'recipient', 'gpg'})
        self.assertEqual(set(result['recipient']), {'state', 'sha256', 'phase', 'code'})
        self.assertEqual(set(result['gpg']), {'state', 'sha256', 'code', 'stderr_classes'})
        self.assertNotIn(SENTINEL, json.dumps(result))
        CLIENT.validate_recipient_diagnostic(result)
        return result

    def test_reads_only_both_fixed_error_files_and_never_generates_or_reads_keys(self):
        raw = encoded(recipient_error())
        result = self.project(raw, encoded(gpg_error()))
        self.assertEqual(result['recipient'], {'state': 'OBSERVED',
            'sha256': hashlib.sha256(raw).hexdigest(), 'phase': 'generate', 'code': 'TOOL_EXIT_NONZERO'})
        self.assertEqual(result['gpg']['state'], 'OBSERVED')
        self.assertEqual(result['gpg']['code'], 'EXIT_2')
        self.assertEqual(result['gpg']['stderr_classes'], ['UNCLASSIFIED'])

    def test_absent_files_have_no_invented_digest_or_error(self):
        result = self.project()
        self.assertEqual(result['recipient'], {'state': 'ABSENT', 'sha256': None, 'phase': None, 'code': None})
        self.assertEqual(result['gpg'], {'state': 'ABSENT', 'sha256': None, 'code': None, 'stderr_classes': []})

    def test_untrusted_reads_are_distinct_from_absent_and_redact_exception(self):
        result = self.project(PermissionError(SENTINEL), OSError(SENTINEL))
        self.assertEqual(result['recipient'], {'state': 'UNTRUSTED', 'sha256': None, 'phase': None, 'code': None})
        self.assertEqual(result['gpg'], {'state': 'UNTRUSTED', 'sha256': None, 'code': None, 'stderr_classes': []})

    def test_unrecognized_trusted_bytes_retain_digest_only(self):
        for raw in (b'not-json ' + SENTINEL.encode(), encoded([]), encoded({'unexpected': SENTINEL})):
            with self.subTest(raw_type=raw[:8]):
                result = self.project(raw, raw)
                self.assertEqual(result['recipient'], {'state': 'UNRECOGNIZED',
                    'sha256': hashlib.sha256(raw).hexdigest(), 'phase': None, 'code': None})
                self.assertEqual(result['gpg'], {'state': 'UNRECOGNIZED',
                    'sha256': hashlib.sha256(raw).hexdigest(), 'code': None, 'stderr_classes': []})

    def test_unknown_recipient_phase_or_code_is_not_echoed(self):
        for field in ('phase', 'code'):
            value = recipient_error()
            value['first_error'][field] = SENTINEL
            result = self.project(encoded(value))
            self.assertEqual(result['recipient']['state'], 'UNRECOGNIZED')
            self.assertIsNone(result['recipient']['phase'])
            self.assertIsNone(result['recipient']['code'])

    def test_gpg_codes_are_finite_and_classifications_are_sorted_unique(self):
        for code in ('TOOL_TIMEOUT', 'TOOL_OUTPUT_LIMIT', 'TOOL_EXECUTION_FAILURE',
                     'EXIT_-64', 'EXIT_0', 'EXIT_255'):
            with self.subTest(code=code):
                result = self.project(gpg=encoded(gpg_error(code=code)))
                self.assertEqual(result['gpg']['state'], 'OBSERVED')
                self.assertEqual(result['gpg']['code'], code)
                classes = result['gpg']['stderr_classes']
                self.assertEqual(classes, sorted(set(classes)))
                self.assertTrue(set(classes) <= set(SERVER.DIAGNOSTIC_TOOL_CLASSES))
        for code in ('EXIT_-65', 'EXIT_256', 'EXIT_2 ' + SENTINEL, SENTINEL):
            with self.subTest(code=code):
                result = self.project(gpg=encoded(gpg_error(code=code)))
                self.assertEqual(result['gpg']['state'], 'UNRECOGNIZED')

    def test_malformed_or_oversized_base64_is_unrecognized_without_tool_execution(self):
        malformed = gpg_error()
        malformed['stderr_prefix_base64'] = '!!' + SENTINEL
        for value in (malformed, gpg_error(prefix=b'x' * 8193)):
            result = self.project(gpg=encoded(value))
            self.assertEqual(result['gpg']['state'], 'UNRECOGNIZED')
            self.assertIsNone(result['gpg']['code'])
            self.assertEqual(result['gpg']['stderr_classes'], [])

    def test_private_text_can_only_enter_output_as_digest_and_finite_class(self):
        value = gpg_error(prefix=(SENTINEL + '\n[GNUPG:] ' + SENTINEL).encode())
        result = self.project(encoded(recipient_error()), encoded(value))
        self.assertEqual(result['gpg']['state'], 'OBSERVED')
        self.assertEqual(result['gpg']['stderr_classes'], ['UNCLASSIFIED'])
        self.assertNotIn('recipient_home', json.dumps(result))
        self.assertNotIn('stderr_prefix_base64', json.dumps(result))
        value['private_exception'] = SENTINEL
        unexpected = self.project(gpg=encoded(value))
        self.assertEqual(unexpected['gpg']['state'], 'UNRECOGNIZED')
        self.assertIsNone(unexpected['gpg']['code'])
        self.assertEqual(unexpected['gpg']['stderr_classes'], [])

    def test_client_rejects_extra_fields_unknown_states_and_arbitrary_text(self):
        baseline = self.project(encoded(recipient_error()), encoded(gpg_error()))
        cases = []
        for component, field, value in (
                ('recipient', 'private_log', SENTINEL), ('gpg', 'stderr', SENTINEL),
                ('recipient', 'state', SENTINEL), ('gpg', 'state', SENTINEL),
                ('recipient', 'phase', SENTINEL), ('recipient', 'code', SENTINEL),
                ('gpg', 'code', SENTINEL), ('gpg', 'stderr_classes', [SENTINEL]),
                ('recipient', 'sha256', 'A' * 64), ('gpg', 'sha256', 'a' * 63)):
            changed = copy.deepcopy(baseline)
            changed[component][field] = value
            cases.append(changed)
        cases.extend(([], None, {**baseline, 'private': SENTINEL}))
        for value in cases:
            with self.subTest(value_type=type(value).__name__):
                with self.assertRaises(ValueError):
                    CLIENT.validate_recipient_diagnostic(value)

    def test_client_rejects_inconsistent_absent_untrusted_unrecognized_states(self):
        for state in ('ABSENT', 'UNTRUSTED', 'UNRECOGNIZED'):
            baseline = self.project()
            for component in ('recipient', 'gpg'):
                baseline[component]['state'] = state
                baseline[component]['sha256'] = 'a' * 64 if state == 'UNRECOGNIZED' else None
            CLIENT.validate_recipient_diagnostic(baseline)
            for component, field, value in (
                    ('recipient', 'phase', 'generate'), ('recipient', 'code', 'TOOL_EXIT_NONZERO'),
                    ('gpg', 'code', 'EXIT_2'), ('gpg', 'stderr_classes', ['UNCLASSIFIED'])):
                changed = copy.deepcopy(baseline)
                changed[component][field] = value
                with self.assertRaises(ValueError):
                    CLIENT.validate_recipient_diagnostic(changed)

    def test_fixed_file_reader_uses_noatime_nofollow_and_unchanged_metadata(self):
        before = types.SimpleNamespace(st_mode=stat.S_IFREG | 0o600,
                                       st_uid=0, st_gid=0, st_nlink=1)
        path = SERVER.TARGET_BASE + '/' + SERVER.ERROR_NAME
        with patch.object(SERVER.os, 'open', return_value=55) as opening, \
                patch.object(SERVER.os, 'fstat', return_value=before), \
                patch.object(SERVER.os, 'dup', return_value=56), \
                patch.object(SERVER.os, 'fdopen', side_effect=lambda fd, mode: io.BytesIO(b'{}')), \
                patch.object(SERVER.os, 'close'):
            self.assertEqual(SERVER._read_public_file(path, 2), b'{}')
        self.assertEqual(opening.call_args.args[0], path)
        self.assertTrue(opening.call_args.args[1] & os.O_NOATIME)
        self.assertTrue(opening.call_args.args[1] & os.O_NOFOLLOW)
        after = types.SimpleNamespace(st_mode=stat.S_IFREG | 0o600,
                                      st_uid=0, st_gid=0, st_nlink=1, changed=True)
        with patch.object(SERVER.os, 'open', return_value=55), \
                patch.object(SERVER.os, 'fstat', side_effect=[before, after]), \
                patch.object(SERVER.os, 'dup', return_value=56), \
                patch.object(SERVER.os, 'fdopen', side_effect=lambda fd, mode: io.BytesIO(b'{}')), \
                patch.object(SERVER.os, 'close'):
            with self.assertRaises(SERVER._Stop):
                SERVER._read_public_file(path, 2)

    def test_fixed_file_reader_rejects_size_overflow_and_untrusted_file_identity(self):
        path = SERVER.TARGET_BASE + '/' + SERVER.ERROR_NAME
        for permissions, uid, gid, links, payload in (
                (0o600, 0, 0, 1, b'xxx'), (0o644, 0, 0, 1, b'{}'),
                (0o600, 1000, 0, 1, b'{}'), (0o600, 0, 1000, 1, b'{}'),
                (0o600, 0, 0, 2, b'{}')):
            metadata = types.SimpleNamespace(st_mode=stat.S_IFREG | permissions,
                st_uid=uid, st_gid=gid, st_nlink=links)
            with patch.object(SERVER.os, 'open', return_value=55), \
                    patch.object(SERVER.os, 'fstat', return_value=metadata), \
                    patch.object(SERVER.os, 'dup', return_value=56), \
                    patch.object(SERVER.os, 'fdopen', side_effect=lambda fd, mode: io.BytesIO(payload)), \
                    patch.object(SERVER.os, 'close'):
                with self.assertRaises(SERVER._Stop):
                    SERVER._read_public_file(path, 2)
