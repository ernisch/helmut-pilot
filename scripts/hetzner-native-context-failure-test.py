"""Focused synthetic retained-error fixtures; no real target, proc or unit query."""
import ast
from contextlib import ExitStack
import copy
import json
import os
from pathlib import Path
import stat
import tempfile
import types
import unittest
from unittest.mock import Mock, patch

HERE = Path(__file__).resolve().parent
SOURCE = HERE / 'hetzner-native-context-failure.py'
RAW = SOURCE.read_bytes()
M = types.ModuleType('synthetic_context_failure')
exec(compile(RAW, str(SOURCE), 'exec'), M.__dict__)
READER_RAW = (HERE / 'hetzner-native-runtime-metadata.py').read_bytes()
FROZEN = types.ModuleType('synthetic_frozen_reader')
exec(compile(READER_RAW, '<frozen-reader-only-pure-helpers>', 'exec'), FROZEN.__dict__)


def info(value):
    row = FROZEN.metadata(value)
    row[3:5] = [0, 0]  # Only the test fixture's logical root-owned filesystem.
    return row


class Filesystem:
    def __init__(self, root):
        self.root = root
        self.calls = []
        self.validate = Mock()
        self.namespace = {'__source_bytes__': READER_RAW, 'CONTRACT_SHA256': M.METADATA_CONTRACT,
            'trusted_parent': self.parent, 'read_fixed': self.read,
            'metadata': info, 'unique_json': FROZEN.unique_json,
            'ERROR_CODES': FROZEN.ERROR_CODES, 'CONTEXT_ERROR_CODES': FROZEN.CONTEXT_ERROR_CODES,
            'EXCEPTION_TYPES': FROZEN.EXCEPTION_TYPES,
            'validate_config': self.validate}

    def path(self, logical):
        allowed = set(M.ROLES.values())
        is_temp = logical.startswith(M.JOB_ROOT + '/') and M.re.fullmatch(
            '[.]setup-write-[a-f0-9]{32}[.]tmp', logical.rsplit('/', 1)[1])
        ancestor = any(value.startswith(logical + '/') for value in allowed)
        if logical not in allowed and not is_temp and not ancestor: raise AssertionError('Unclosed fixture role')
        return self.root / logical.lstrip('/')

    def put(self, logical, value, raw=False):
        path = self.path(logical)
        path.parent.mkdir(parents=True, exist_ok=True)
        current = path.parent
        while current != self.root:
            current.chmod(0o700); current = current.parent
        path.write_bytes(value if raw else M.encoded(value)); path.chmod(0o600)

    def parent(self, logical):
        path = self.path(logical)
        # Follow no fixture directory links, just as the reused production helper.
        current = self.root
        for part in path.relative_to(self.root).parts[:-1]:
            current = current / part
            if current.is_symlink(): raise OSError('Synthetic parent symlink rejected')
        fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_NOATIME)
        return fd, path.name, [['fixture-parent', info(os.fstat(fd))]]

    def read(self, logical, deadline, limit, expected_bytes, expected_sha, owner, mode, allow_empty=False):
        self.calls.append((logical, deadline, limit, expected_bytes, expected_sha, owner, mode, allow_empty))
        if (owner, mode, limit, expected_bytes, allow_empty) != ((0, 0), 0o600, M.CAP, None, True):
            raise AssertionError('Strict reused read arguments changed')
        path = self.path(logical)
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NOATIME | os.O_NONBLOCK)
        try:
            before = os.fstat(fd)
            if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1 or stat.S_IMODE(before.st_mode) != mode:
                raise OSError('Synthetic identity rejected')
            data = os.read(fd, limit + 1)
            if len(data) > limit or len(data) != before.st_size or info(before) != info(os.fstat(fd)):
                raise OSError('Synthetic changed/oversize file rejected')
            digest = M.sha(data)
            if expected_sha is not None and digest != expected_sha: raise M.Stop('METADATA_FILE_HASH')
            return data, {'sha256': digest, 'bytes': len(data), 'metadata': info(before)}
        finally: os.close(fd)


def job():
    return {'schema': 'helmut-context-daemon-binding-v2-service-job-v1',
        'request': {'schema': 'helmut-native-control-request-v1', 'operation': 'admit',
            'nonce': M.FAILED_NONCE, 'plan_sha256': M.PLAN, 'payload_sha256': M.FAILED_SOURCE},
        'controller_source_sha256': M.FAILED_SOURCE, 'plan_sha256': M.PLAN, 'case_id': M.CASE,
        'phase': 'context', 'boot_id': '00000000-1111-2222-3333-444444444444',
        'deadline': 900.0, 'runtime_seconds': 200,
        'controller': {'pid': 321, 'start_ticks': 1234, 'namespace': [1, 2]},
        'phase_data': {'old_receipt_sha256': 'a'*64, 'recovery_ready_sha256': 'b'*64,
            'public_ready_sha256': 'c'*64, 'context_ready_sha256': None},
        'assets': copy.deepcopy(M.ASSETS), 'job_namespace': M.NAMESPACE}


def service_error(code='UNIT_EXTRA_COMMAND', phase='context'):
    return {'schema': 'helmut-context-daemon-binding-v2-service-error-v1',
        'status': 'FAIL_KEEP_STATE_NO_RETRY', 'phase': phase, 'code': code,
        'exception_type': 'Stop', 'errno': None, 'native_qualified': False, 'native_go_consumed': False}


def component_error():
    return {'status': 'FAIL_KEEP_PARTIAL_CONTEXT_NO_RETRY', 'phase': 'private-mounts',
        'code': 'CANONICAL_PROOF_MISMATCH', 'exceptionType': 'Stop', 'errno': None,
        'case_id': M.CASE, 'globalEmptyAnchorsCreated': [], 'globalAnchorAttempts': [],
        'mountState': 'UNKNOWN', 'lastAcknowledgedStep': 2,
        'nativeQualified': False, 'nativeGOConsumed': False}


class ReaderTests(unittest.TestCase):
    def setUp(self):
        self.stack = ExitStack(); self.addCleanup(self.stack.close)
        temp = self.stack.enter_context(tempfile.TemporaryDirectory())
        self.fs = Filesystem(Path(temp))
        self.reader = self.fs.namespace
        self.context = {'base': M.BASE, 'source_sha256': 'a'*64, 'deployment_commit': 'b'*40, 'deadline': 1200.0}
        self.stack.enter_context(patch.object(M.time, 'monotonic', return_value=1000.0))
        for key in ('getuid', 'geteuid', 'getgid', 'getegid'):
            self.stack.enter_context(patch.object(M.os, key, return_value=0))
        # Exact public failure framing, with no dependency on private evidence.
        self.response_raw = M.encoded({
            'schema': 'helmut-native-control-response-v1', 'operation': 'admit', 'nonce': M.FAILED_NONCE,
            'plan_sha256': M.PLAN, 'payload_sha256': M.FAILED_SOURCE,
            'result': {'schema': 'helmut-context-continuation-result-v1', 'status': 'FAIL_KEEP_STATE_NO_RETRY',
                'contract_id': M.NAMESPACE, 'contract_sha256': M.FAILED_CONTRACT, 'phase': 'context',
                'code': 'WORKER_FAILED', 'authority_sha256': None, 'attempt_sha256': None,
                'ready_sha256': None, 'accepted_sha256': None, 'lifecycle_sha256': None,
                'native_qualified': False, 'native_go_consumed': False}, 'result_sha256': M.RESULT_SHA})
        self.assertEqual(M.sha(self.response_raw), M.RESPONSE_SHA)
        self.result = json.loads(self.response_raw)['result']
        self.fs.put(M.ROLES['root_response'], self.response_raw, raw=True)
        self.fs.put(M.ROLES['namespace_error'], self.result)
        self.fs.put(M.ROLES['job'], job())
        self.fs.put(M.ROLES['job_error'], service_error('WORKER_FAILED'))
        # Existing context root makes leaf absence a positive observation.
        self.fs.path(M.ROLES['component_error']).parent.mkdir(parents=True, exist_ok=True)

    def observe(self): return M.observe_context_failure(self.context, self.reader, {})

    def reject(self, code):
        result = self.observe()
        self.assertEqual(result['status'], 'FAIL_CLOSED_NOT_NATIVE_QUALIFIED')
        self.assertEqual(result['code'], code)
        self.assertIsNone(result['records']); self.assertIsNone(result['snapshot_sha256'])
        self.assertIs(result['native_qualified'], False); self.assertIs(result['native_go_consumed'], False)
        return result

    def test_inner_temporary_error_visible_when_component_is_absent(self):
        temporary = M.JOB_ROOT + '/.setup-write-' + '1'*32 + '.tmp'
        self.fs.put(temporary, service_error())
        result = self.observe()
        self.assertEqual(result['status'], 'CONTEXT_FAILURE_OBSERVED_NOT_READY')
        self.assertEqual(result['records']['component_error']['state'], 'ABSENT')
        self.assertEqual(result['records']['component_receipt']['state'], 'ABSENT')
        self.assertEqual(result['records']['component_receipt']['absence']['scope'], 'PARENT')
        self.assertEqual(result['records']['job_error']['code'], 'WORKER_FAILED')
        self.assertEqual(result['records']['job_temporary_error_0']['code'], 'UNIT_EXTRA_COMMAND')
        self.assertEqual(result['cause_records'], ['job_temporary_error_0'])
        self.assertEqual(result['cause_state'], 'STORED_INNER_ERROR_OBSERVED')
        self.assertEqual(self.fs.validate.call_count, 2)
        self.assertTrue(all(row[4] in (None, M.RESPONSE_SHA) for row in self.fs.calls))
        for forbidden in (M.JOB_ROOT.encode(), b'"pid"', b'"controller"', b'"assets"', b'argv'):
            self.assertNotIn(forbidden, M.encoded(result))

    def test_no_inner_error_is_explicitly_unknown(self):
        result = self.observe()
        self.assertEqual(result['status'], 'CONTEXT_FAILURE_OBSERVED_NOT_READY')
        self.assertEqual(result['cause_state'], 'UNKNOWN_INNER_ERROR_ABSENT_OR_UNRECOGNIZED')
        self.assertEqual(result['cause_records'], [])

    def test_component_error_preserves_exact_code_phase_errno(self):
        value = component_error(); value['errno'] = 22
        self.fs.put(M.ROLES['component_error'], value)
        row = self.observe()['records']['component_error']
        self.assertEqual((row['state'], row['code'], row['phase'], row['errno']),
                         ('PRESENT', 'CANONICAL_PROOF_MISMATCH', 'private-mounts', 22))

    def test_partial_error_is_bound_unknown_and_never_empty_or_absent(self):
        self.fs.put(M.ROLES['component_error'], b'', raw=True)
        row = self.observe()['records']['component_error']
        self.assertEqual(row['state'], 'UNKNOWN'); self.assertEqual(row['bytes'], 0)
        self.assertEqual(row['sha256'], M.sha(b'')); self.assertIsNone(row['code'])

    def test_receipt_metadata_and_stored_status_never_become_acceptance(self):
        keys = {'status', 'case_id', 'scope_sha256', 'stage_ready_sha256', 'daemon',
            'propagationWasPrivate', 'globalEmptyAnchorsCreated', 'mountTargets', 'canonicalProofs',
            'runnerUid', 'runnerGid', 'publicEnginePresent', 'publicEngineState', 'nativeQualified',
            'nativeGOConsumed', 'budgetParentCreated', 'publicCheckoutReadySHA256', 'publicCheckoutReceipt',
            'sourcePreparationKind', 'recoveryReadySHA256', 'historicalRestoreReceiptSHA256',
            'historicalStageSourceSHA256', 'restoreSourceSHA256'}
        value = dict.fromkeys(keys, 'PRIVATE_ORIGINAL_MUST_NOT_EXPORT')
        value.update(status='CONTEXT_PREPARED_NOT_NATIVE_QUALIFIED', case_id=M.CASE,
            nativeQualified=False, nativeGOConsumed=False, budgetParentCreated=False,
            runnerUid=1000, runnerGid=1000, publicEnginePresent=True,
            publicEngineState='MOUNTED_REQUIRES_FRESH_SOURCE_ADMISSION',
            sourcePreparationKind='ACCEPTED_LOCAL_PAX_RECOVERY')
        for role in ('component_receipt_pending', 'component_receipt'):
            self.fs.put(M.ROLES[role], value)
        result = self.observe()
        for role in ('component_receipt_pending', 'component_receipt'):
            row = result['records'][role]
            self.assertEqual(row['state'], 'UNKNOWN_UNACCEPTED')
            self.assertEqual(row['source_status'], 'CONTEXT_PREPARED_NOT_NATIVE_QUALIFIED')
            self.assertEqual(row['sha256'], M.sha(M.encoded(value)))
        self.assertNotIn(b'PRIVATE_ORIGINAL', M.encoded(result))

    def test_component_error_cannot_claim_service_only_code(self):
        value = component_error(); value['code'] = 'UNIT_PROPERTIES'
        self.fs.put(M.ROLES['component_error'], value)
        self.assertEqual(self.observe()['records']['component_error']['state'], 'UNKNOWN')

    def test_unknown_or_private_semantics_never_exported(self):
        for change in ({'code': 'SECRET_PRIVATE_TOKEN'}, {'exception_type': 'SecretPrivateClass'},
                       {'phase': '/private/value'}, {'errno': True}, {'extra': 'PRIVATE_ORIGINAL'},
                       {'native_go_consumed': True}, {'schema': 'helmut-setup-service-error-v1'}):
            with self.subTest(change=change):
                self.fs.put(M.ROLES['job_error'], {**service_error(), **change})
                result = self.observe(); row = result['records']['job_error']
                self.assertEqual(row['state'], 'UNKNOWN'); self.assertIsNone(row['code'])
                self.assertNotIn(b'PRIVATE', M.encoded(result))

    def test_duplicate_json_error_is_unknown_without_hiding_other_roles(self):
        self.fs.put(M.ROLES['component_error'], b'{"code":"SECRET","code":"OTHER"}\n', raw=True)
        result = self.observe()
        self.assertEqual(result['status'], 'CONTEXT_FAILURE_OBSERVED_NOT_READY')
        self.assertEqual(result['records']['component_error']['state'], 'UNKNOWN')
        self.assertNotIn(b'SECRET', M.encoded(result))

    def test_required_root_response_hash_is_immutable(self):
        self.fs.put(M.ROLES['root_response'], self.response_raw + b' ', raw=True)
        self.reject('METADATA_FILE_HASH')

    def test_exact_failed_job_source_nonce_namespace_and_assets_required(self):
        for change in ({'controller_source_sha256': 'f'*64}, {'job_namespace': 'other'},
                       {'case_id': 'f'*64}, {'phase': 'image'}, {'assets': {}},
                       {'request': {**job()['request'], 'nonce': 'f'*64}}):
            with self.subTest(change=change):
                self.fs.put(M.ROLES['job'], {**job(), **change})
                self.reject('CONTEXT_FAILURE_JOB_BINDING')

    def test_noncanonical_job_rejected(self):
        self.fs.put(M.ROLES['job'], json.dumps(job()).encode(), raw=True)
        self.reject('CONTEXT_FAILURE_RECORD_UNKNOWN')

    def test_unclosed_file_and_temporary_limit_reject(self):
        path = self.fs.path(M.ROLES['job']).parent / 'unknown-private-file'
        path.write_bytes(b'PRIVATE')
        self.reject('CONTEXT_FAILURE_JOB_MEMBERSHIP'); path.unlink()
        for index in range(M.TEMP_CAP + 1):
            self.fs.put(M.JOB_ROOT + '/.setup-write-' + format(index, '032x') + '.tmp', service_error())
        self.reject('CONTEXT_FAILURE_JOB_LIMIT')

    def test_symlink_and_hardlink_and_wrong_mode_are_rejected(self):
        path = self.fs.path(M.ROLES['job_error'])
        raw = path.read_bytes(); path.unlink(); path.symlink_to('/not-a-fixture')
        self.reject('CONTEXT_FAILURE_IO_OR_FORMAT'); path.unlink(); self.fs.put(M.ROLES['job_error'], raw, raw=True)
        target = path.parent / 'guard.py'; os.link(path, target)
        self.reject('CONTEXT_FAILURE_IO_OR_FORMAT'); target.unlink()
        path.chmod(0o644); self.reject('CONTEXT_FAILURE_IO_OR_FORMAT')

    def test_changed_second_snapshot_is_rejected(self):
        original = self.fs.read
        count = 0
        def changed(*args, **kwargs):
            nonlocal count
            if args[0] == M.ROLES['job_error']:
                count += 1
                if count == 2: self.fs.put(M.ROLES['job_error'], service_error('UNIT_PROPERTIES'))
            return original(*args, **kwargs)
        self.reader['read_fixed'] = changed
        self.reject('CONTEXT_FAILURE_SNAPSHOT_DRIFT')

    def test_unsafe_source_context_deadline_root_fail_before_reads(self):
        for change in ({'base': '/other'}, {'source_sha256': 'A'*64}, {'deployment_commit': 'private'},
                       {'extra': 'wire-path'}, {'deadline': 1301}, {'deadline': True}, {'deadline': float('nan')}):
            old = self.context; self.context = {**old, **change}
            with self.subTest(change=change):
                self.reject('CONTEXT_FAILURE_DEADLINE' if 'deadline' in change else 'CONTEXT_FAILURE_CONTEXT')
            self.context = old
        self.reader['__source_bytes__'] = b'changed'; self.reject('CONTEXT_FAILURE_SOURCE_PIN')
        self.assertEqual(self.fs.calls, [])
        with patch.object(M.os, 'getuid', return_value=1000): self.reject('CONTEXT_FAILURE_ROOT_REQUIRED')

    def test_capsule_and_nonce_close_source_contract_action_and_time(self):
        value = {'schema': 'helmut-context-failure-capsule-v1', 'contract_id': M.CONTRACT_ID,
            'action': 'inspect', 'source_sha256': 'a'*64, 'contract_sha256': M.CONTRACT_SHA256,
            'nonce': 'b'*64, 'issued_at_utc': 1000, 'expires_at_utc': 1300}
        self.assertEqual(M.validate_capsule(value, 'a'*64, 1050), value)
        self.assertEqual(M.request_nonce(value), M.sha(M.PREFIX + M.encoded(value)))
        for change in ({'action': 'setup'}, {'source_sha256': 'c'*64}, {'contract_sha256': 'd'*64},
                       {'nonce': 'A'*64}, {'extra': 'selector'}, {'issued_at_utc': True},
                       {'expires_at_utc': 1301}, {'issued_at_utc': 1200}):
            with self.subTest(change=change), self.assertRaises(M.Stop):
                M.validate_capsule({**value, **change}, 'a'*64, 1050)
        with self.assertRaises(M.Stop): M.validate_capsule(value, 'a'*64, 1301)

    def test_source_has_no_effect_or_process_entrypoints(self):
        tree = ast.parse(RAW)
        imports = {item.name for node in ast.walk(tree) if isinstance(node, ast.Import) for item in node.names}
        self.assertFalse(imports & {'subprocess', 'ctypes', 'socket', 'http', 'signal', 'fcntl'})
        forbidden = {'fork', 'kill', 'killpg', 'pidfd_open', 'setns', 'mkdir', 'unlink', 'rename',
                     'write', 'chmod', 'chown', 'fsync', 'system', 'popen'}
        self.assertFalse({node.attr for node in ast.walk(tree) if isinstance(node, ast.Attribute)} & forbidden)
        self.assertEqual(M.sha(M.encoded(M.CONFIG)), M.CONTRACT_SHA256)
        self.assertEqual(M.CONFIG['metadata_reader_sha256'], M.sha(READER_RAW))

    def test_error_allowlist_covers_the_fixed_context_service_and_driver_sources(self):
        codes = set()
        for name in ('hetzner-native-context-continuation.py',
                     'hetzner-native-context-continuation-service.py',
                     'hetzner-native-context-continuation-driver.py'):
            tree = ast.parse((HERE / name).read_bytes())
            for node in ast.walk(tree):
                if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) \
                        and node.func.id in ('need', 'Stop') and node.args:
                    value = node.args[-1]
                    if isinstance(value, ast.Constant) and type(value.value) is str and value.value.isupper():
                        codes.add(value.value)
        self.assertFalse(codes - (FROZEN.ERROR_CODES | M.EXTRA_CODES))


if __name__ == '__main__': unittest.main()
