"""Direct-source client qualification using only own synthetic transport fixtures."""
import base64
import contextlib
import copy
import io
import json
import os
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).with_name('hetzner-native-automation-client.py')
with os.fdopen(os.open(SOURCE, os.O_RDONLY | os.O_NOFOLLOW | os.O_NOATIME), 'rb') as stream:
    RAW = stream.read()
M = types.ModuleType('synthetic_successor_client')
exec(compile(RAW, str(SOURCE), 'exec'), M.__dict__)
PAYLOAD, CONTRACT = '2'*64, '3'*64


def environment(operation='status'):
    return {'GITHUB_REPOSITORY': M.REPOSITORY, 'GITHUB_REPOSITORY_OWNER': 'ernisch',
        'GITHUB_REF': M.BRANCH, 'GITHUB_WORKFLOW_REF': M.WORKFLOW_REF,
        'GITHUB_EVENT_NAME': 'workflow_dispatch', 'HELMUT_NATIVE_OPERATION': operation,
        'HELMUT_NATIVE_PLAN_SHA256': M.STAGE_PLAN, 'HELMUT_NATIVE_PAYLOAD_SHA256': PAYLOAD}


def capsule(action='inspect', phase='recover'):
    return {'schema': 'helmut-setup-successor-capsule-v1', 'contract_id': M.SETUP_CONTRACT,
        'action': action, 'phase': None if action == 'inspect' else phase, 'source_sha256': PAYLOAD,
        'contract_sha256': CONTRACT, 'nonce': '4'*64,
        'inspection_nonce': None if action == 'inspect' else '5'*64,
        'inspection_result_sha256': None if action == 'inspect' else '6'*64,
        'issued_at_utc': 990, 'expires_at_utc': 1100}


def capsule_environment(value):
    env = environment('status' if value['action'] == 'inspect' else 'admit')
    env.update(HELMUT_NATIVE_CONTROL_MODE='setup-inspect-v1' if value['action'] == 'inspect' else 'setup-successor-v1',
               HELMUT_NATIVE_SETUP_CAPSULE=base64.b64encode(M.canonical(value)).decode())
    return env


def sent_request(value):
    return M.request('status' if value['action'] == 'inspect' else 'admit', M.STAGE_PLAN, PAYLOAD,
                     M.setup_request_nonce(value))


def inspection(value):
    meta = [1]*12
    gzip_meta = meta.copy(); gzip_meta[6] = 487052181
    files = {name: {'sha256': '7'*64, 'metadata': meta.copy()} for name in
        ('global_error', 'job', 'worker_error', 'guard.py', 'driver.py', 'recovery.py',
         'restore.py', 'public.py', 'context.py', 'image.py')}
    return {'schema': 'helmut-setup-successor-inspection-v1', 'status': 'INSPECTED_NOT_ADMITTED',
        'request_nonce': M.setup_request_nonce(value), 'capsule': copy.deepcopy(value), 'source_sha256': PAYLOAD,
        'asset_set_sha256': '8'*64, 'contract_sha256': CONTRACT, 'coordinator_sha256': '9'*64,
        'runtime': {'boot_id': '11111111-2222-3333-4444-555555555555', 'mount_identity': [1]*8,
            'namespace_identity': [1, 2], 'old_controller_ended': True,
            'old_unit': {'fields_sha256': 'a'*64, 'invocation_id': 'b'*32, 'main_pid': 4242,
                         'cgroup': {'state': 'ABSENT', 'identity': None}}},
        'history': {'schema': 'helmut-setup-history-summary-v1', 'status': 'HISTORICAL_FAILURE_BOUND_NOT_AUTHORITY',
            'code': 'UNIT_PROPERTIES', 'files': files, 'job_directory': meta.copy(), 'legacy_jobs_directory': meta.copy(),
            'native_qualified': False, 'native_go_consumed': False},
        'gzip': {'sha256': 'be423c617c14d92ed833c6e8a97c3a094eb70c23dc13b05b2c114c953f73b18a',
                 'bytes': 487052181, 'metadata': gzip_meta}, 'observed_at_utc': 1000,
        'native_qualified': False, 'native_go_consumed': False}


def setup_result(value, failure=False, preflight=False):
    return {'schema': 'helmut-setup-successor-result-v1',
        'status': 'FAIL_KEEP_STATE_NO_RETRY' if failure else 'SETUP_PHASE_COMPLETE_NOT_NATIVE_QUALIFIED',
        'contract_id': M.SETUP_CONTRACT, 'contract_sha256': CONTRACT,
        'phase': 'preflight' if preflight else value['phase'],
        'code': 'SUCCESSOR_FAILURE' if failure else 'SETUP_PHASE_COMPLETE',
        **{name: None if failure else 'a'*64 for name in
           ('authority_sha256', 'attempt_sha256', 'ready_sha256', 'accepted_sha256', 'lifecycle_sha256')},
        'native_qualified': False, 'native_go_consumed': False}


def response(sent, result):
    return {**sent, 'schema': 'helmut-native-control-response-v1', 'result': result,
            'result_sha256': M.digest(M.canonical(result))}


def legacy_status():
    return {'status': 'CONTROL_READY', 'enabled_operations': ['status', 'recipient', 'stage', 'admit'],
        'native_enabled': False, 'source_sha256': PAYLOAD, 'recipient_diagnostic': {
            'recipient': {'state': 'ABSENT', 'sha256': None, 'phase': None, 'code': None},
            'gpg': {'state': 'ABSENT', 'sha256': None, 'code': None, 'stderr_classes': []}}}


class ClientTests(unittest.TestCase):
    def setUp(self):
        self.stack = contextlib.ExitStack()
        self.addCleanup(self.stack.close)
        self.stack.enter_context(patch.object(M.time, 'time', return_value=1000))
        self.stack.enter_context(patch.object(M.subprocess, 'Popen', side_effect=AssertionError('no real transport')))

    def validate(self, result, value=None, sent=None):
        value = capsule() if value is None else value
        sent = sent_request(value) if sent is None else sent
        return M.validate_response(M.canonical(response(sent, result)), sent, value)

    def test_only_exact_source_proven_prearm_error_pair_is_a_different_duplicate(self):
        value=inspection(capsule())
        master={'schema':'helmut-setup-service-error-v1','status':'FAIL_KEEP_STATE_NO_RETRY',
            'phase':'recover','code':'UNIT_PROPERTIES','exception_type':'Stop','errno':None,
            'native_qualified':False,'native_go_consumed':False}
        loser=master|{'code':'WORKER_ALREADY_ATTEMPTED'}
        def row(body):
            raw=M.canonical(body)+b'\n';metadata=[1]*12;metadata[6]=len(raw)
            return {'sha256':M.digest(raw),'metadata':metadata}
        name='.setup-write-'+'a'*32+'.tmp'
        value['history']['files']['worker_error']=row(master)
        value['history']['files'][name]=row(loser)
        self.validate(value)
        for body in (master|{'code':'WORKER_FAILED'},master|{'code':'CONTROLLER_LOST'},
                     loser|{'phase':'checkout'},loser|{'exception_type':'ValueError'},loser|{'errno':0},
                     loser|{'native_qualified':True},loser|{'native_go_consumed':True},loser|{'extra':'x'}):
            changed=copy.deepcopy(value);changed['history']['files'][name]=row(body)
            with self.subTest(body=body),self.assertRaises(ValueError):self.validate(changed)
        for field in ('worker_error',name):
            for key in ('sha256','metadata'):
                changed=copy.deepcopy(value)
                if key=='sha256':changed['history']['files'][field][key]='e'*64
                else:changed['history']['files'][field][key][6]+=1
                with self.subTest(field=field,key=key),self.assertRaises(ValueError):self.validate(changed)

    def test_canonical_capsules_modes_phases_and_exact_nonce_prefix(self):
        for action, phase in [('inspect', None)] + [('setup', phase) for phase in M.SETUP_PHASES]:
            value = capsule(action, phase)
            env = capsule_environment(value)
            line, parsed = M.setup_capsule(env, env['HELMUT_NATIVE_OPERATION'])
            self.assertEqual(line, M.canonical(value)+b'\n'); self.assertEqual(parsed, value)
            self.assertEqual(M.validate_context(env), (env['HELMUT_NATIVE_OPERATION'], M.STAGE_PLAN, PAYLOAD))
            self.assertEqual(M.setup_request_nonce(value), M.digest(b'helmut-setup-successor-request-v1\0'+M.canonical(value)+b'\n'))
            self.assertNotEqual(M.setup_request_nonce(value), value['nonce'])

    def test_every_capsule_field_missing_wrong_duplicate_or_extra_is_rejected_before_transport(self):
        original = capsule()
        for key in original:
            for kind in ('missing', 'wrong', 'duplicate'):
                value = copy.deepcopy(original)
                if kind == 'missing': del value[key]
                if kind == 'wrong': value[key] = '/synthetic-private-text'
                raw = M.canonical(value)
                if kind == 'duplicate': raw = raw[:-1]+b','+M.canonical({key: original[key]})[1:]
                env = capsule_environment(original)
                env['HELMUT_NATIVE_SETUP_CAPSULE'] = base64.b64encode(raw).decode()
                with self.subTest(key=key, kind=kind), patch.object(M, 'transport_configuration') as transport:
                    with self.assertRaises(ValueError): M.client(env)
                    transport.assert_not_called()
        env = capsule_environment({**original, 'extra': 'private'})
        with self.assertRaises(ValueError): M.validate_context(env)

    def test_base64_json_canonical_limits_and_real_integer_time_bounds(self):
        valid = capsule()
        raw = M.canonical(valid)
        bad_raw = (raw+b'\n', b' '+raw, json.dumps(valid, indent=2).encode(), b'null', b'[]',
                   b'NaN', b'{"bad":NaN}', b'x'*8192, b'\xff')
        for value in bad_raw:
            env = capsule_environment(valid); env['HELMUT_NATIVE_SETUP_CAPSULE'] = base64.b64encode(value).decode()
            with self.subTest(raw=value[:20]), self.assertRaises(ValueError): M.validate_context(env)
        encoded = base64.b64encode(raw).decode()
        for text in (encoded+'\n', ' '+encoded, encoded+'=', '!', None, True, 'A'*10928):
            env = capsule_environment(valid); env['HELMUT_NATIVE_SETUP_CAPSULE'] = text
            with self.subTest(text=str(text)[:20]), self.assertRaises(ValueError): M.validate_context(env)
        for change in ({'issued_at_utc': True}, {'expires_at_utc': 1100.0}, {'issued_at_utc': 1001},
            {'issued_at_utc': 600, 'expires_at_utc': 900}, {'issued_at_utc': 800, 'expires_at_utc': 1101},
            {'issued_at_utc': 1100, 'expires_at_utc': 990}, {'issued_at_utc': 0}):
            with self.subTest(change=change), self.assertRaises(ValueError): M.validate_context(capsule_environment({**valid, **change}))

    def test_mode_operation_stage_collisions_and_empty_modes_never_start_transport(self):
        for mode in ('disabled', 'setup-inspect-v1', 'setup-successor-v1', '', None):
            env = environment(); env['HELMUT_NATIVE_CONTROL_MODE'] = mode
            with self.subTest(mode=mode), patch.object(M, 'transport_configuration') as transport:
                with self.assertRaises(ValueError): M.client(env)
                transport.assert_not_called()
        for action in ('inspect', 'setup'):
            for operation in M.OPERATIONS:
                env = capsule_environment(capsule(action)); env['HELMUT_NATIVE_OPERATION'] = operation
                if operation == ('status' if action == 'inspect' else 'admit'): continue
                with self.subTest(action=action, operation=operation), patch.object(M, 'transport_configuration') as transport:
                    with self.assertRaises(ValueError): M.client(env)
                    transport.assert_not_called()
        for change in ({'HELMUT_NATIVE_CONTROL_MODE': 'control-v1'}, {'HELMUT_NATIVE_CONTROL_MODE': 'setup-successor-v1'},
                       {'HELMUT_NATIVE_STAGE_CAPSULE': 'AA=='}, {'HELMUT_NATIVE_PLAN_SHA256': 'a'*64}):
            env = {**capsule_environment(capsule()), **change}
            with self.subTest(change=change), self.assertRaises(ValueError): M.validate_context(env)

    def test_legacy_default_and_stage_encryption_framing_remain_unchanged(self):
        env = environment()
        self.assertEqual(M.setup_capsule(env, 'status'), (b'', None))
        self.assertEqual(M.validate_context(env), ('status', M.STAGE_PLAN, PAYLOAD))
        env['HELMUT_NATIVE_CONTROL_MODE'] = 'control-v1'
        self.assertEqual(M.setup_capsule(env, 'status'), (b'', None))
        # Explicit non-cryptographic packet bytes; no key creation, import or use.
        raw = b'\xc1\x0a\x03'+b'\0'*8+b'\x12\xd2\x01\x01'
        env = environment('stage'); env['HELMUT_NATIVE_STAGE_CAPSULE'] = base64.b64encode(raw).decode()
        self.assertEqual(M.stage_capsule(env, 'stage'), (env['HELMUT_NATIVE_STAGE_CAPSULE'].encode()+b'\n', raw))
        self.assertEqual(M.setup_capsule(env, 'stage'), (b'', None))
        sent = M.request('status', M.STAGE_PLAN, PAYLOAD, 'f'*64)
        reply = response(sent, legacy_status())
        self.assertEqual(M.validate_response(M.canonical(reply), sent), reply)
        with self.assertRaises(ValueError): M.validate_response(M.canonical(response(sent, inspection(capsule()))), sent)
        with self.assertRaises(ValueError): self.validate(legacy_status())

    def test_inspection_closed_runtime_history_gzip_and_optional_error_temp(self):
        value = capsule(); result = inspection(value)
        self.validate(result)
        result['runtime']['old_unit']['cgroup'] = {'state': 'EMPTY', 'identity': [1]*12}
        name = '.setup-write-'+'a'*32+'.tmp'
        result['history']['files'][name] = copy.deepcopy(result['history']['files']['worker_error'])
        self.validate(result)
        changed = copy.deepcopy(result); changed['history']['files'][name]['sha256'] = 'b'*64
        with self.assertRaises(ValueError): self.validate(changed)
        for key in ('.setup-write-'+'A'*32+'.tmp', 'arbitrary/path'):
            changed = copy.deepcopy(result); changed['history']['files'][key] = changed['history']['files'].pop(name)
            with self.subTest(key=key), self.assertRaises(ValueError): self.validate(changed)
        changed = copy.deepcopy(result); changed['history']['files']['.setup-write-'+'c'*32+'.tmp'] = {'sha256': 'b'*64, 'metadata': [1]*12}
        with self.assertRaises(ValueError): self.validate(changed)

    def test_every_public_inspection_nested_field_is_closed_typed_and_complete(self):
        value = capsule(); original = inspection(value)
        def containers(row, prefix=()):
            if isinstance(row, dict):
                yield prefix, row
                for key, child in row.items(): yield from containers(child, prefix+(key,))
        def owner(changed, path):
            for key in path: changed = changed[key]
            return changed
        for path, row in containers(original):
            changed = copy.deepcopy(original); owner(changed, path)['extra_private'] = 'secret'
            with self.subTest(path=path, kind='extra'), self.assertRaises(ValueError): self.validate(changed)
            for key, field in row.items():
                for kind in ('missing', 'wrong'):
                    changed = copy.deepcopy(original); parent = owner(changed, path)
                    if kind == 'missing': del parent[key]
                    else: parent[key] = 'private text'
                    with self.subTest(path=path, key=key, kind=kind), self.assertRaises(ValueError): self.validate(changed)
        for change in ({'observed_at_utc': True}, {'observed_at_utc': 1101}):
            with self.assertRaises(ValueError): self.validate({**original, **change})
        changed = copy.deepcopy(original); changed['history']['files']['job']['metadata'][0] = True
        with self.assertRaises(ValueError): self.validate(changed)
        changed = copy.deepcopy(original); changed['runtime']['namespace_identity'][0] = True
        with self.assertRaises(ValueError): self.validate(changed)
        changed = copy.deepcopy(original); changed['gzip']['metadata'][6] = 1
        with self.assertRaises(ValueError): self.validate(changed)

    def test_setup_success_and_failures_bind_contract_phase_and_all_five_hashes(self):
        for phase in M.SETUP_PHASES:
            value = capsule('setup', phase)
            for failure in (False, True): self.validate(setup_result(value, failure), value)
            self.validate(setup_result(value, True, True), value)
            for change in ({'contract_sha256': None}, {'contract_id': 'foreign'}, {'phase': 'unknown'},
                           {'code': 'private text'}, {'native_qualified': 0}, {'native_go_consumed': True}, {'extra': 'secret'}):
                with self.subTest(phase=phase, change=change), self.assertRaises(ValueError):
                    self.validate({**setup_result(value), **change}, value)
            for key in ('authority_sha256', 'attempt_sha256', 'ready_sha256', 'accepted_sha256', 'lifecycle_sha256'):
                with self.subTest(key=key), self.assertRaises(ValueError): self.validate({**setup_result(value), key: None}, value)
                with self.assertRaises(ValueError): self.validate({**setup_result(value, True), key: 'a'*64}, value)
        value = capsule()
        self.validate(setup_result(value, True, True), value)
        with self.assertRaises(ValueError): self.validate(setup_result(value), value)

    def test_legacy_jobs_directory_is_a_required_distinct_closed_metadata_binding(self):
        original = inspection(capsule())
        original['history']['legacy_jobs_directory'] = [2]*12
        self.validate(original)
        changed = copy.deepcopy(original); del changed['history']['legacy_jobs_directory']
        with self.assertRaises(ValueError): self.validate(changed)
        for metadata in (None, 'private text', [], [1]*11, [1]*13, [True]*12, [2**64]*12):
            changed = copy.deepcopy(original); changed['history']['legacy_jobs_directory'] = metadata
            with self.subTest(metadata=metadata), self.assertRaises(ValueError): self.validate(changed)
        changed = copy.deepcopy(original); del changed['history']['job_directory']
        with self.assertRaises(ValueError): self.validate(changed)

    def test_outer_header_nonce_hash_duplicate_and_capsule_binding(self):
        value = capsule(); sent = sent_request(value); result = inspection(value)
        for key in M.RESPONSE_FIELDS:
            reply = response(sent, result); del reply[key]
            with self.subTest(key=key), self.assertRaises(ValueError): M.validate_response(M.canonical(reply), sent, value)
        for key, wrong in (('nonce', 'a'*64), ('plan_sha256', 'b'*64), ('payload_sha256', 'c'*64),
                           ('operation', 'admit'), ('schema', 'foreign'), ('result_sha256', M.digest(M.canonical(result)+b'\n'))):
            reply = response(sent, result); reply[key] = wrong
            with self.subTest(key=key), self.assertRaises(ValueError): M.validate_response(M.canonical(reply), sent, value)
        reply = response(sent, result)
        raw = M.canonical(reply)
        for duplicate in (raw[:-1]+b',"nonce":"'+sent['nonce'].encode()+b'"}',
                          raw.replace(b'"main_pid":4242', b'"main_pid":4242,"main_pid":4242')):
            with self.assertRaises(ValueError): M.validate_response(duplicate, sent, value)
        with self.assertRaises(ValueError): self.validate(result, {**value, 'nonce': 'f'*64}, sent)
        changed = copy.deepcopy(result); changed['capsule']['nonce'] = 'e'*64
        with self.assertRaises(ValueError): self.validate(changed)

    def run_client(self, value=None, failed=False, code=0):
        env = environment() if value is None else capsule_environment(value)
        with tempfile.TemporaryDirectory(prefix='.successor-client-', dir=SOURCE.parent.parent) as temporary:
            env['RUNNER_TEMP'] = temporary
            bodies = []
            def exchange(arguments, body, include_returncode):
                self.assertTrue(include_returncode); bodies.append(body)
                lines = body.splitlines()
                sent = M.json_unique(lines[0])
                if value is None:
                    self.assertEqual(len(lines), 1); result = legacy_status()
                else:
                    self.assertEqual(lines[1], M.canonical(value)); self.assertEqual(len(lines), 2)
                    self.assertEqual(sent['nonce'], M.setup_request_nonce(value))
                    result = setup_result(value, True, True) if failed else (
                        inspection(value) if value['action'] == 'inspect' else setup_result(value))
                self.assertEqual(set(sent), {'schema', 'operation', 'nonce', 'plan_sha256', 'payload_sha256'})
                return M.canonical(response(sent, result))+b'\n', code
            with patch.object(M, 'transport_configuration', return_value=('100.96.83.66', 'SYNTHETIC-PUBLIC',
                    'SYNTHETIC-NOT-A-PRIVATE-KEY')), patch.object(M, 'bounded_exchange', side_effect=exchange), \
                    patch.object(M.secrets, 'token_hex', side_effect=(AssertionError('capsule binds nonce') if value else None),
                                 return_value='f'*64) as nonce, contextlib.redirect_stdout(io.StringIO()):
                if code and not failed:
                    with self.assertRaisesRegex(ValueError, 'ssh-failed'): M.client(env)
                    self.assertFalse((Path(temporary)/'helmut-native-public').exists())
                    return
                self.assertEqual(M.client(env), 1 if failed else 0)
                if value is None: nonce.assert_called_once_with(32)
                else: nonce.assert_not_called()
            directory = Path(temporary)/'helmut-native-public'
            exported = (directory/'RESPONSE.SAFE.json').read_bytes()
            self.assertEqual((directory/'RESPONSE.SAFE.sha256').read_text(), M.digest(exported)+'  RESPONSE.SAFE.json\n')
            self.assertEqual(M.json_unique(exported)['result']['status'], 'FAIL_KEEP_STATE_NO_RETRY' if failed else
                ('CONTROL_READY' if value is None else 'INSPECTED_NOT_ADMITTED' if value['action'] == 'inspect' else
                 'SETUP_PHASE_COMPLETE_NOT_NATIVE_QUALIFIED'))

    def test_synthetic_transport_framing_validated_fail_artifacts_and_red_exit(self):
        self.run_client()
        for value in (capsule(), capsule('setup')):
            self.run_client(value)
            self.run_client(value, failed=True, code=0)
            self.run_client(value, failed=True, code=1)
            self.run_client(value, code=1)  # Includes incomplete-input transport outcomes.

    def test_new_modes_bind_exact_manifest_host_before_transport_keys_or_artifact(self):
        for value in (capsule(), capsule('setup')):
            env = capsule_environment(value)
            # Workflow validation deliberately has no transport host yet.
            self.assertEqual(M.validate_context(env)[0], env['HELMUT_NATIVE_OPERATION'])
            with tempfile.TemporaryDirectory(prefix='.successor-host-', dir=SOURCE.parent.parent) as temporary:
                env['RUNNER_TEMP'] = temporary
                with patch.object(M, 'transport_configuration', return_value=(
                        '100.96.83.67', 'SYNTHETIC-PUBLIC', 'SYNTHETIC-NOT-A-PRIVATE-KEY')), \
                        patch.object(M, 'bounded_exchange') as exchange:
                    with self.assertRaisesRegex(ValueError, '^host-denied$'): M.client(env)
                    exchange.assert_not_called()
                self.assertEqual(list(Path(temporary).iterdir()), [])


if __name__ == '__main__':
    unittest.main(verbosity=2)
