"""Own synthetic SAFE metadata chunks and fake transport; no target or original I/O."""
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
M = types.ModuleType('synthetic_runtime_metadata_client')
exec(compile(RAW, str(SOURCE), 'exec'), M.__dict__)
PRODUCTION_SHA = M.RUNTIME_METADATA_SHA256
PAYLOAD = 'a'*64
prefix, suffix = b'{"fixture":"', b'","schema":"synthetic-runtime-metadata"}'
# Exactly sized, clearly synthetic metadata; the expected digest is replaced only inside tests.
DATA = prefix + b'X'*(207733-len(prefix)-len(suffix)) + suffix


def capsule(index=0):
    return {'schema': 'helmut-runtime-metadata-capsule-v1', 'contract_id': 'runtime-metadata-failed-context-20261026-v1',
        'action': 'read', 'chunk': index, 'source_sha256': PAYLOAD,
        'contract_sha256': M.RUNTIME_METADATA_CONTRACT_SHA256, 'nonce': 'b'*64,
        'issued_at_utc': 990, 'expires_at_utc': 1100}


def environment(value=None):
    value = capsule() if value is None else value
    return {'GITHUB_REPOSITORY': M.REPOSITORY, 'GITHUB_REPOSITORY_OWNER': 'ernisch',
        'GITHUB_REF': M.BRANCH, 'GITHUB_WORKFLOW_REF': M.WORKFLOW_REF,
        'GITHUB_EVENT_NAME': 'workflow_dispatch', 'HELMUT_NATIVE_OPERATION': 'status',
        'HELMUT_NATIVE_PLAN_SHA256': M.STAGE_PLAN, 'HELMUT_NATIVE_PAYLOAD_SHA256': PAYLOAD,
        'HELMUT_NATIVE_CONTROL_MODE': 'runtime-metadata-v1',
        'HELMUT_NATIVE_SETUP_CAPSULE': base64.b64encode(M.canonical(value)).decode()}


def sent(value):
    return M.request('status', M.STAGE_PLAN, PAYLOAD, M.runtime_metadata_request_nonce(value))


def diagnostic_record(state='ABSENT', **fields):
    row = dict.fromkeys(('sha256', 'bytes', 'metadata', 'source_status', 'phase', 'code', 'exception_type',
        'errno', 'mount_state', 'last_acknowledged_step', 'anchor_attempt_count', 'anchor_created_count'))
    row['state'] = state
    if state != 'ABSENT':
        row.update(sha256=M.digest(b'SYNTHETIC_RETAINED_RECORD'), bytes=25,
                   metadata=[1, 2, 0o100600, 0, 0, 1, 25, 10, 11, 12, 0, 1])
    row.update(fields)
    return row


def failure_diagnostic():
    return {'schema': 'helmut-context-retained-failure-diagnostic-v1',
        'status': 'RETAINED_CONTEXT_FAILURE_NOT_READY', 'failed_phase': 'context',
        'failed_nonce': M.RUNTIME_METADATA_FAILED['failed_nonce'], 'coordinator_code': 'WORKER_FAILED',
        'records': {
            'namespace_error': diagnostic_record('PRESENT', source_status='FAIL_KEEP_STATE_NO_RETRY',
                                                 phase='context', code='WORKER_FAILED'),
            'job_error': diagnostic_record('PRESENT', source_status='FAIL_KEEP_STATE_NO_RETRY',
                                           phase='context', code='PHASE_FAILED', exception_type='Stop'),
            'component_error': diagnostic_record('UNKNOWN'),
            'component_attempt': diagnostic_record('UNKNOWN_UNACCEPTED'),
            'component_receipt_pending': diagnostic_record(), 'component_receipt': diagnostic_record()},
        'native_qualified': False, 'native_go_consumed': False}


def result(value, failure=False):
    index = value['chunk']
    common = {'schema': 'helmut-runtime-binding-metadata-read-v1',
        'status': 'FAIL_CLOSED_NOT_NATIVE_QUALIFIED' if failure else 'RETAINED_CONTEXT_FAILURE_METADATA_NOT_READY',
        'contract_id': M.RUNTIME_METADATA_CONTRACT, 'contract_sha256': M.RUNTIME_METADATA_CONTRACT_SHA256,
        'source_sha256': PAYLOAD, 'dataset_sha256': M.RUNTIME_METADATA_SHA256, 'dataset_bytes': 207733,
        'chunk_index': index, 'data_base64': None, 'native_qualified': False, 'native_go_consumed': False}
    if failure: return {**common, 'code': 'METADATA_SETUP_NOT_COMPLETE'}
    raw = DATA[index*65536:(index+1)*65536]
    return {**common, 'file_binding': {'sha256': M.RUNTIME_METADATA_SHA256, 'bytes': 207733,
            'metadata': [1, 2, 0o100600, 0, 0, 1, 207733, 10, 11, 12, 0, 408]},
        'scope_sha256': M.STAGE_SCOPE, 'source_row_sha256': 'c'*64,
        'partial_setup_proof': {'schema': 'helmut-runtime-metadata-partial-setup-proof-v1', **M.RUNTIME_METADATA_SETUP,
            'authority_sha256': M.RUNTIME_METADATA_AUTHORITY, 'once_sha256': 'e'*64, 'baseline_sha256': 'f'*64,
            'accepted_sha256': M.RUNTIME_METADATA_ACCEPTED.copy(),
            'job_seal_sha256': dict.fromkeys(('recover', 'checkout'), '2'*64), 'accepted_phases': ['recover', 'checkout'],
            **M.RUNTIME_METADATA_FAILED, 'failed_job_sha256': '3'*64,
            'failed_unit_state': 'UNKNOWN_UNIT_OBSERVATION',
            'native_qualified': False, 'native_go_consumed': False},
        'failure_diagnostic': failure_diagnostic(),
        'chunk_count': 4, 'chunk_size': 65536, 'chunk_sha256': M.digest(raw),
        'data_base64': base64.b64encode(raw).decode(), 'json_summary': {
            'root_type': 'dict', 'nodes': 3, 'max_depth': 1,
            'type_counts': {'dict': 1, 'list': 0, 'str': 2, 'int': 0, 'float': 0, 'bool': 0, 'NoneType': 0},
            'ascii_only': True, 'utf8_valid': True, 'schema_value_sha256': M.digest(b'synthetic-runtime-metadata')}}


def response(request, value):
    return {**request, 'schema': 'helmut-native-control-response-v1', 'result': value,
            'result_sha256': M.digest(M.canonical(value))}


class RuntimeClientTests(unittest.TestCase):
    def setUp(self):
        self.stack = contextlib.ExitStack()
        self.addCleanup(self.stack.close)
        self.stack.enter_context(patch.object(M.time, 'time', return_value=1000))
        self.stack.enter_context(patch.object(M, 'RUNTIME_METADATA_SHA256', M.digest(DATA)))
        self.stack.enter_context(patch.object(M.subprocess, 'Popen', side_effect=AssertionError('no real transport')))

    def validate(self, value, cap=None, request=None):
        cap = capsule() if cap is None else cap
        request = sent(cap) if request is None else request
        return M.validate_response(M.canonical(response(request, value)), request, cap)

    def test_fixed_production_pins_and_exact_four_chunk_transport(self):
        self.assertEqual(PRODUCTION_SHA, '71e661eeaa3a71c74a7dc9aa7d5cf6568e12f728365f2a3b97fa08c1e8076475')
        self.assertEqual(M.RUNTIME_METADATA_CONTRACT_SHA256, 'b85cecc106ab2e2a40d19f02c8caa412e6e6e3f86c6ee4c5bfa18fbe712a2caf')
        self.assertEqual(M.RUNTIME_METADATA_SETUP, {
            'source_sha256': '1fc63bf8c90a6f13a2eebf4981d7f0c7da0b10f5e5c2fd563551e117f0ec58fe',
            'deployment_commit': '8139b3a99d04e3e854f886123869bf669da6389d',
            'contract_sha256': 'e5ffcce62f8a419f11596e7ef88e9d10f4585d33b1b18e7d962670475d4d4059',
            'asset_set_sha256': '9941129431d0575caa1afe9afab497fd7d111c18ede0566b5498ec5089751c07'})
        self.assertEqual(M.RUNTIME_METADATA_AUTHORITY, '2afddc86477157c81ad537bbc06037aa9f5039a690ef4c7e774c79e942824ad3')
        self.assertEqual(M.RUNTIME_METADATA_ACCEPTED, {
            'recover': 'e3b41edd946e54519f101803fbb1ef4012b5b025c927e97119ceac1a79e5dbd5',
            'checkout': 'f4f57bdbf31298950e3d932859521318da3eb2d520a10603f80054560294767b'})
        self.assertEqual(M.RUNTIME_METADATA_FAILED, {
            'failed_phase': 'context',
            'failed_nonce': '8e1471f3745f196f402ccc4ed96000225c73d725f0349e75a481e1f858073d59',
            'failed_response_sha256': 'b4099527980858a10433f5f24749d8a6d4241947a257491b4214650e5fedb2fd',
            'failed_result_sha256': 'b5d407c5ea19a08bbba3d1151cbf274622ff80821a2b92c8be4199bca0612e30'})
        chunks, nonces = [], []
        for index in range(4):
            cap = capsule(index)
            line, decoded = M.setup_capsule(environment(cap), 'status')
            self.assertEqual(line, M.canonical(cap)+b'\n'); self.assertEqual(decoded, cap)
            self.assertEqual(M.validate_context(environment(cap)), ('status', M.STAGE_PLAN, PAYLOAD))
            self.assertEqual(M.control_request_nonce(cap), M.digest(b'helmut-runtime-metadata-request-v1\0'+line))
            self.assertNotEqual(M.control_request_nonce(cap), M.setup_request_nonce(cap))
            reply = self.validate(result(cap), cap)
            raw = base64.b64decode(reply['result']['data_base64'])
            self.assertEqual(len(raw), 65536 if index < 3 else 11125)
            chunks.append(raw); nonces.append(sent(cap)['nonce'])
        self.assertEqual(len(set(nonces)), 4)
        self.assertEqual(b''.join(chunks), DATA)
        self.assertEqual(M.digest(b''.join(chunks)), M.RUNTIME_METADATA_SHA256)

    def test_reader_and_client_share_the_closed_partial_failure_contract_and_source_enums(self):
        path = SOURCE.with_name('hetzner-native-runtime-metadata.py')
        with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NOATIME), 'rb') as stream:
            reader_source = stream.read()
        reader = types.ModuleType('synthetic_reader_schema_only')
        exec(compile(reader_source, str(path), 'exec'), reader.__dict__)
        self.assertEqual(reader.CONTRACT_ID, M.RUNTIME_METADATA_CONTRACT)
        self.assertEqual(reader.CONTRACT_SHA256, M.RUNTIME_METADATA_CONTRACT_SHA256)
        self.assertEqual(reader.ERROR_CODES, M.RUNTIME_METADATA_ERROR_CODES)
        self.assertEqual(reader.JOB_ERROR_CODES, M.RUNTIME_METADATA_JOB_ERROR_CODES)
        self.assertEqual(reader.CONTEXT_ERROR_CODES, M.RUNTIME_METADATA_CONTEXT_ERROR_CODES)
        self.assertEqual(reader.EXCEPTION_TYPES, M.RUNTIME_METADATA_EXCEPTION_TYPES)
        self.assertEqual(len(reader.ERROR_CODES), 188)
        self.assertEqual(len(reader.JOB_ERROR_CODES), 188)
        self.assertEqual(len(reader.CONTEXT_ERROR_CODES), 93)
        self.assertEqual(len(reader.EXCEPTION_TYPES), 71)

    def test_each_capsule_field_missing_wrong_extra_duplicate_and_time_is_rejected_before_transport(self):
        cap = capsule()
        for key in cap:
            for kind in ('missing', 'wrong', 'duplicate'):
                changed = copy.deepcopy(cap)
                if kind == 'missing': del changed[key]
                if kind == 'wrong': changed[key] = 'private free text'
                raw = M.canonical(changed)
                if kind == 'duplicate': raw = raw[:-1]+b','+M.canonical({key: cap[key]})[1:]
                env = environment(cap); env['HELMUT_NATIVE_SETUP_CAPSULE'] = base64.b64encode(raw).decode()
                with self.subTest(key=key, kind=kind), patch.object(M, 'transport_configuration') as transport:
                    with self.assertRaises(ValueError): M.client(env)
                    transport.assert_not_called()
        changes = ({'extra': '/free/path'}, {'chunk': True}, {'chunk': -1}, {'chunk': 4}, {'chunk': 0.0},
            {'issued_at_utc': True}, {'expires_at_utc': 1100.0}, {'issued_at_utc': 1001},
            {'issued_at_utc': 800, 'expires_at_utc': 1101}, {'issued_at_utc': 800, 'expires_at_utc': 999},
            {'issued_at_utc': 0}, {'issued_at_utc': 1100, 'expires_at_utc': 990},
            {'source_sha256': '0'*64}, {'contract_sha256': '0'*64},
            {'contract_id': 'runtime-metadata-20261026-v1'},
            {'contract_sha256': '684232c392965d8e72df46820601e26098222e04298fc03d7a92d8878ae88286'},
            {'contract_sha256': '8909ca48f13ea836abdf6b8833bd1341a5c2dec2007a7ea2f4e0088cd5a9c91b'}, {'nonce': 'A'*64})
        for change in changes:
            with self.subTest(change=change), self.assertRaises(ValueError): M.validate_context(environment({**cap, **change}))

    def test_noncanonical_base64_json_and_size_limits_are_rejected(self):
        cap = capsule(); encoded = environment(cap)['HELMUT_NATIVE_SETUP_CAPSULE']
        for raw in (M.canonical(cap)+b'\n', b' '+M.canonical(cap), json.dumps(cap, indent=2).encode(),
                    b'NaN', b'{"chunk":NaN}', b'null', b'[]', b'\xff', b'X'*8192):
            env = environment(cap); env['HELMUT_NATIVE_SETUP_CAPSULE'] = base64.b64encode(raw).decode()
            with self.subTest(raw=raw[:12]), self.assertRaises(ValueError): M.validate_context(env)
        for text in (encoded+'\n', encoded+'=', ' '+encoded, '!', None, True, 'A'*10928):
            env = environment(cap); env['HELMUT_NATIVE_SETUP_CAPSULE'] = text
            with self.subTest(text=str(text)[:12]), self.assertRaises(ValueError): M.validate_context(env)

    def test_modes_schema_dispatch_and_legacy_stage_isolation_are_closed(self):
        for mode in ('control-v1', 'disabled', 'setup-inspect-v1', 'setup-successor-v1', None, ''):
            env = environment(); env['HELMUT_NATIVE_CONTROL_MODE'] = mode
            with self.subTest(mode=mode), self.assertRaises(ValueError): M.validate_context(env)
        for operation in ('recipient', 'stage', 'admit', 'four-tx'):
            env = environment(); env['HELMUT_NATIVE_OPERATION'] = operation
            with self.subTest(operation=operation), patch.object(M, 'transport_configuration') as transport:
                with self.assertRaises(ValueError): M.client(env)
                transport.assert_not_called()
        for change in ({'HELMUT_NATIVE_STAGE_CAPSULE': 'AA=='}, {'HELMUT_NATIVE_SETUP_CAPSULE': ''},
                       {'HELMUT_NATIVE_PLAN_SHA256': '0'*64}):
            with self.subTest(change=change), self.assertRaises(ValueError): M.validate_context({**environment(), **change})
        env = environment(); del env['HELMUT_NATIVE_SETUP_CAPSULE']; del env['HELMUT_NATIVE_CONTROL_MODE']
        self.assertEqual(M.setup_capsule(env, 'status'), (b'', None))
        old = {'schema': 'helmut-setup-successor-capsule-v1', 'contract_id': M.SETUP_CONTRACT,
            'action': 'inspect', 'phase': None, 'source_sha256': PAYLOAD, 'contract_sha256': 'e'*64,
            'nonce': 'f'*64, 'inspection_nonce': None, 'inspection_result_sha256': None,
            'issued_at_utc': 990, 'expires_at_utc': 1100}
        env = environment(); env['HELMUT_NATIVE_SETUP_CAPSULE'] = base64.b64encode(M.canonical(old)).decode()
        with self.assertRaises(ValueError): M.validate_context(env)
        env['HELMUT_NATIVE_CONTROL_MODE'] = 'setup-inspect-v1'
        self.assertEqual(M.setup_capsule(env, 'status')[1], old)
        self.assertEqual(M.control_request_nonce(old), M.setup_request_nonce(old))
        raw = b'\xc1\x0a\x03'+b'\0'*8+b'\x12\xd2\x01\x01'
        env['HELMUT_NATIVE_SETUP_CAPSULE'] = ''; env['HELMUT_NATIVE_CONTROL_MODE'] = 'control-v1'
        env['HELMUT_NATIVE_STAGE_CAPSULE'] = base64.b64encode(raw).decode()
        self.assertEqual(M.stage_capsule(env, 'stage'), (env['HELMUT_NATIVE_STAGE_CAPSULE'].encode()+b'\n', raw))

    def test_each_success_result_field_and_nested_binding_is_required_closed_and_typed(self):
        cap = capsule(); original = result(cap)
        def containers(row, path=()):
            if isinstance(row, dict):
                yield path, row
                for key, child in row.items(): yield from containers(child, path+(key,))
        def owner(row, path):
            for key in path: row = row[key]
            return row
        for path, row in containers(original):
            for key in row:
                for kind in ('missing', 'wrong'):
                    changed = copy.deepcopy(original)
                    if kind == 'missing': del owner(changed, path)[key]
                    else: owner(changed, path)[key] = 'untrusted private text'
                    with self.subTest(path=path, key=key, kind=kind), self.assertRaises(ValueError): self.validate(changed)
            changed = copy.deepcopy(original); owner(changed, path)['extra'] = '/free/path'
            with self.subTest(path=path, kind='extra'), self.assertRaises(ValueError): self.validate(changed)
        for key in ('native_qualified', 'native_go_consumed'):
            with self.assertRaises(ValueError): self.validate({**original, key: 0})
        changed = copy.deepcopy(original); changed['file_binding']['metadata'][0] = True
        with self.assertRaises(ValueError): self.validate(changed)
        changed = copy.deepcopy(original); changed['file_binding']['metadata'][6] -= 1
        with self.assertRaises(ValueError): self.validate(changed)
        for key, stale in (('source_sha256', 'afbccf72ad9f60ea84091567268c3b7927bcc6df9d99dac0c5da61e27e546a85'),
                           ('deployment_commit', '18c2736ac4da2cf946ccb4494ad2963091de7d32'),
                           ('contract_sha256', '029d6e301758fd27172a58c03ae99ae2003f93f84c37959192ad1124a93a5738')):
            changed = copy.deepcopy(original); changed['partial_setup_proof'][key] = stale
            with self.subTest(stale=key), self.assertRaises(ValueError): self.validate(changed)

    def test_chunks_cannot_select_other_datasets_lengths_encodings_or_malformed_summaries(self):
        cap = capsule(); original = result(cap)
        for change in ({'chunk_index': True}, {'chunk_index': 1}, {'chunk_count': True}, {'chunk_count': 3},
                       {'chunk_size': 65535}, {'dataset_bytes': True}, {'dataset_bytes': 207732},
                       {'data_base64': original['data_base64']+'\n'}, {'data_base64': 'AA=='},
                       {'chunk_sha256': '0'*64}, {'dataset_sha256': '0'*64}, {'scope_sha256': '0'*64}):
            with self.subTest(keys=tuple(change)), self.assertRaises(ValueError): self.validate({**original, **change})
        for change in ({'nodes': True}, {'nodes': 0}, {'nodes': 100001}, {'nodes': 4}, {'max_depth': True},
                       {'max_depth': 65}, {'root_type': []}, {'ascii_only': 1}, {'utf8_valid': False},
                       {'schema_value_sha256': '/private/text'}):
            changed = copy.deepcopy(original); changed['json_summary'].update(change)
            with self.subTest(change=change), self.assertRaises(ValueError): self.validate(changed)
        changed = copy.deepcopy(original); changed['json_summary']['schema_value_sha256'] = None
        self.validate(changed)
        changed = copy.deepcopy(original); changed['json_summary']['type_counts']['str'] = True
        with self.assertRaises(ValueError): self.validate(changed)

    def test_header_nonce_prefix_source_hash_and_duplicate_json_cannot_be_reflected(self):
        cap = capsule(); request = sent(cap); value = result(cap)
        for key, wrong in (('nonce', M.setup_request_nonce(cap)), ('operation', 'admit'),
                           ('plan_sha256', 'c'*64), ('payload_sha256', 'd'*64), ('schema', 'foreign'),
                           ('result_sha256', M.digest(M.canonical(value)+b'\n'))):
            reply = response(request, value); reply[key] = wrong
            with self.subTest(key=key), self.assertRaises(ValueError): M.validate_response(M.canonical(reply), request, cap)
        raw = M.canonical(response(request, value))
        for duplicate in (raw[:-1]+b',"nonce":"'+request['nonce'].encode()+b'"}',
                          raw.replace(b'"chunk_count":4', b'"chunk_count":4,"chunk_count":4')):
            with self.assertRaises(ValueError): M.validate_response(duplicate, request, cap)
        reply = response(request, value)
        with self.assertRaises(ValueError): M.validate_response(M.canonical(reply), request)
        for invalid in ([], False, 5, ''):
            with self.assertRaises(ValueError): M.validate_response(M.canonical(reply), request, invalid)
        with self.assertRaises(ValueError): self.validate(value, capsule(1), request)

    def test_partial_proof_cannot_reflect_four_accepted_or_erase_the_retained_failure(self):
        original = result(capsule())
        self.assertEqual(original['status'], 'RETAINED_CONTEXT_FAILURE_METADATA_NOT_READY')
        self.assertEqual(original['partial_setup_proof']['accepted_phases'], ['recover', 'checkout'])
        for key in ('authority_sha256', 'failed_nonce', 'failed_response_sha256', 'failed_result_sha256'):
            changed = copy.deepcopy(original); changed['partial_setup_proof'][key] = '0'*64
            with self.subTest(key=key), self.assertRaises(ValueError): self.validate(changed)
        for key in ('accepted_sha256', 'job_seal_sha256'):
            changed = copy.deepcopy(original)
            changed['partial_setup_proof'][key].update(context='1'*64, image='2'*64)
            with self.subTest(key=key), self.assertRaises(ValueError): self.validate(changed)
        changed = copy.deepcopy(original); changed['partial_setup_proof']['accepted_sha256']['recover'] = '0'*64
        with self.assertRaises(ValueError): self.validate(changed)
        changed = copy.deepcopy(original); changed['partial_setup_proof']['accepted_phases'] = list(M.SETUP_PHASES)
        with self.assertRaises(ValueError): self.validate(changed)
        changed = copy.deepcopy(original); changed['partial_setup_proof']['schema'] = 'helmut-runtime-metadata-setup-proof-v1'
        with self.assertRaises(ValueError): self.validate(changed)
        changed = copy.deepcopy(original); changed['setup_proof'] = changed.pop('partial_setup_proof')
        with self.assertRaises(ValueError): self.validate(changed)
        changed = copy.deepcopy(original); changed['status'] = 'SAFE_METADATA_CHUNK_NOT_NATIVE_QUALIFIED'
        with self.assertRaises(ValueError): self.validate(changed)

    def test_failed_unit_observation_is_required_closed_and_never_grants_native_readiness(self):
        for state in ('UNKNOWN_UNIT_OBSERVATION', 'LOADED_QUIESCENT'):
            observed = result(capsule())
            observed['partial_setup_proof']['failed_unit_state'] = state
            self.validate(observed)
            for path in ((), ('partial_setup_proof',), ('failure_diagnostic',)):
                for key in ('native_qualified', 'native_go_consumed'):
                    for value in (True, 0):
                        invalid = copy.deepcopy(observed)
                        owner = invalid[path[0]] if path else invalid
                        owner[key] = value
                        with self.subTest(state=state, path=path, key=key, value=value), self.assertRaises(ValueError):
                            self.validate(invalid)
        for state in (None, False, 0, [], {}, '', 'UNKNOWN', 'ABSENT', 'NOT_FOUND', 'EMPTY_EXEC',
                      'LOADED_RUNNING', 'LOADED_QUIESCENT\n'):
            invalid = result(capsule()); invalid['partial_setup_proof']['failed_unit_state'] = state
            with self.subTest(state=state), self.assertRaises(ValueError): self.validate(invalid)
        missing = result(capsule()); del missing['partial_setup_proof']['failed_unit_state']
        with self.assertRaises(ValueError): self.validate(missing)
        for field, value in (('unit_absent', True), ('exec_start', [])):
            reflected = result(capsule()); reflected['partial_setup_proof'][field] = value
            with self.subTest(field=field), self.assertRaises(ValueError): self.validate(reflected)

    def test_diagnostic_absent_unknown_and_source_known_fields_never_mean_ready(self):
        original = result(capsule())
        for state in ('ABSENT', 'UNKNOWN'):
            changed = copy.deepcopy(original)
            changed['failure_diagnostic']['records']['component_error'] = diagnostic_record(state)
            self.validate(changed)
            for key, value in (('source_status', 'CONTEXT_PREPARED_NOT_NATIVE_QUALIFIED'),
                               ('phase', 'context'), ('code', 'PHASE_FAILED'), ('exception_type', 'Stop'),
                               ('errno', 0), ('mount_state', 'NOT_STARTED'), ('last_acknowledged_step', 0),
                               ('anchor_attempt_count', 0), ('anchor_created_count', 0)):
                invalid = copy.deepcopy(changed)
                invalid['failure_diagnostic']['records']['component_error'][key] = value
                with self.subTest(state=state, key=key), self.assertRaises(ValueError): self.validate(invalid)
        changed = copy.deepcopy(original)
        changed['failure_diagnostic']['records']['component_error'] = diagnostic_record('PRESENT',
            source_status='FAIL_KEEP_PARTIAL_CONTEXT_NO_RETRY', phase='private-mounts',
            code='CONTEXT_FAILURE', exception_type='Stop', mount_state='UNKNOWN',
            last_acknowledged_step=10, anchor_attempt_count=3, anchor_created_count=2)
        self.validate(changed)  # Stored protocol index10 grants no setup/runtime readiness.
        for step in (-2, 11, True):
            invalid = copy.deepcopy(changed)
            invalid['failure_diagnostic']['records']['component_error']['last_acknowledged_step'] = step
            with self.subTest(step=step), self.assertRaises(ValueError): self.validate(invalid)
        unstarted = copy.deepcopy(changed)
        unstarted['failure_diagnostic']['records']['component_error'].update(
            phase='attempt', mount_state='NOT_STARTED', last_acknowledged_step=None)
        self.validate(unstarted)  # This still permits retained folders/anchors, never readiness.
        self.assertFalse(changed['partial_setup_proof']['native_qualified'])
        self.assertEqual(changed['failure_diagnostic']['status'], 'RETAINED_CONTEXT_FAILURE_NOT_READY')
        for code in ('WORKER_FAILED', 'PHASE_FAILED'):
            invalid = copy.deepcopy(changed)
            invalid['failure_diagnostic']['records']['component_error']['code'] = code
            with self.subTest(component_code=code), self.assertRaises(ValueError): self.validate(invalid)
        for code in ('ANCHOR_NOT_EMPTY_ROOT_0755', 'SOURCE_SUBMOUNT'):
            transported = copy.deepcopy(original)
            transported['failure_diagnostic']['records']['job_error']['code'] = code
            self.validate(transported)  # phase_error retains the Context Stop cause.
        for role in ('component_attempt', 'component_receipt_pending', 'component_receipt'):
            unaccepted = copy.deepcopy(original)
            unaccepted['failure_diagnostic']['records'][role] = diagnostic_record('UNKNOWN_UNACCEPTED')
            self.validate(unaccepted)
            for state in ('UNKNOWN', 'PRESENT'):
                invalid = copy.deepcopy(unaccepted)
                invalid['failure_diagnostic']['records'][role]['state'] = state
                with self.subTest(role=role, state=state), self.assertRaises(ValueError): self.validate(invalid)
            invalid = copy.deepcopy(unaccepted)
            invalid['failure_diagnostic']['records'][role]['source_status'] = 'CONTEXT_PREPARED_NOT_NATIVE_QUALIFIED'
            with self.assertRaises(ValueError): self.validate(invalid)
        for role in ('component_error', 'component_attempt', 'component_receipt_pending', 'component_receipt'):
            bound = copy.deepcopy(original)
            bound['failure_diagnostic']['records'][role] = diagnostic_record(
                'UNKNOWN' if role == 'component_error' else 'UNKNOWN_UNACCEPTED')
            for key in ('sha256', 'bytes', 'metadata'):
                invalid = copy.deepcopy(bound); invalid['failure_diagnostic']['records'][role][key] = None
                with self.subTest(unbound=role, key=key), self.assertRaises(ValueError): self.validate(invalid)
            empty = copy.deepcopy(bound)
            row = empty['failure_diagnostic']['records'][role]
            row.update(sha256=M.digest(b''), bytes=0); row['metadata'][6] = 0
            self.validate(empty)  # Bound O_EXCL partial, never ABSENT or accepted.
            for change in ({'sha256': '0'*64}, {'state': 'PRESENT'}):
                invalid = copy.deepcopy(empty); invalid['failure_diagnostic']['records'][role].update(change)
                with self.subTest(role=role, empty=change), self.assertRaises(ValueError): self.validate(invalid)
            for size in (-1, 0, 16385, True):
                invalid = copy.deepcopy(bound); invalid['failure_diagnostic']['records'][role]['bytes'] = size
                with self.subTest(role=role, size=size), self.assertRaises(ValueError): self.validate(invalid)
            for index, value in ((0, True), (2, 0o120600), (2, 0o100640), (3, 1),
                                 (4, 1), (5, 2), (6, 24)):
                invalid = copy.deepcopy(bound)
                invalid['failure_diagnostic']['records'][role]['metadata'][index] = value
                with self.subTest(role=role, metadata_index=index, value=value), self.assertRaises(ValueError):
                    self.validate(invalid)
        invalid = copy.deepcopy(original)
        invalid['failure_diagnostic']['records']['component_receipt']['sha256'] = 'a'*64
        with self.assertRaises(ValueError): self.validate(invalid)
        for role in ('namespace_error', 'job_error'):
            absent = copy.deepcopy(original)
            absent['failure_diagnostic']['records'][role] = diagnostic_record()
            with self.subTest(absent_mandatory=role), self.assertRaises(ValueError): self.validate(absent)
            unknown = copy.deepcopy(original)
            unknown['failure_diagnostic']['records'][role] = diagnostic_record('UNKNOWN')
            self.validate(unknown)  # Required nonempty bytes remain bound when source parsing is unknown.
            invalid = copy.deepcopy(original)
            row = diagnostic_record('UNKNOWN', sha256=M.digest(b''), bytes=0)
            row['metadata'][6] = 0
            invalid['failure_diagnostic']['records'][role] = row
            with self.subTest(empty_mandatory=role), self.assertRaises(ValueError): self.validate(invalid)
        for key in ('sha256', 'bytes', 'metadata'):
            invalid = copy.deepcopy(original); invalid['failure_diagnostic']['records']['job_error'][key] = None
            with self.subTest(missing_present=key), self.assertRaises(ValueError): self.validate(invalid)
        for key, value in (('code', 'UNKNOWN_UPPERCASE_PRIVATE_CODE'), ('exception_type', 'SecretError'),
            ('source_status', 'RUNTIME_READY'), ('phase', 'image'), ('mount_state', 'READY'),
            ('errno', True), ('errno', -4096), ('errno', 4096), ('last_acknowledged_step', True),
            ('last_acknowledged_step', -2), ('last_acknowledged_step', 11), ('anchor_attempt_count', -1),
            ('anchor_created_count', 4), ('bytes', True)):
            invalid = copy.deepcopy(original); invalid['failure_diagnostic']['records']['job_error'][key] = value
            with self.subTest(key=key, value=value), self.assertRaises(ValueError): self.validate(invalid)
        invalid = copy.deepcopy(original)
        invalid['failure_diagnostic']['records']['component_error']['raw'] = 'SYNTHETIC_SECRET'
        with self.assertRaises(ValueError): self.validate(invalid)

    def test_failures_remain_closed_bound_and_export_no_data(self):
        for index in range(4):
            cap = capsule(index); failure = result(cap, True)
            self.validate(failure, cap)
            for key in failure:
                changed = copy.deepcopy(failure); del changed[key]
                with self.subTest(index=index, key=key), self.assertRaises(ValueError): self.validate(changed, cap)
            for change in ({'data_base64': 'AA=='}, {'code': 'private text'}, {'code': 'A'*65},
                           {'contract_sha256': None}, {'source_sha256': None}, {'chunk_index': None},
                           {'native_qualified': True}, {'native_go_consumed': 0}, {'extra': 'secret'}):
                with self.subTest(index=index, keys=tuple(change)), self.assertRaises(ValueError): self.validate({**failure, **change}, cap)

    def test_fake_transport_exact_host_framing_and_validated_red_failure_artifacts(self):
        for failure, code, index in ((False, 0, 0), (False, 0, 3), (True, 0, 0), (True, 1, 0), (False, 1, 0)):
            cap = capsule(index); env = environment(cap)
            with tempfile.TemporaryDirectory(prefix='.runtime-client-', dir=SOURCE.parent.parent) as temporary:
                env['RUNNER_TEMP'] = temporary
                def exchange(arguments, body, include_returncode):
                    self.assertTrue(include_returncode)
                    lines = body.splitlines(); self.assertEqual(len(lines), 2)
                    self.assertEqual(lines[1], M.canonical(cap))
                    request = M.json_unique(lines[0])
                    self.assertEqual(request, sent(cap)); self.assertEqual(len(request), 5)
                    return M.canonical(response(request, result(cap, failure)))+b'\n', code
                with patch.object(M, 'transport_configuration', return_value=('100.96.83.66',
                        'SYNTHETIC-PUBLIC', 'SYNTHETIC-NOT-A-PRIVATE-KEY')), \
                        patch.object(M, 'bounded_exchange', side_effect=exchange), \
                        patch.object(M.secrets, 'token_hex', side_effect=AssertionError('nonce must bind capsule')), \
                        contextlib.redirect_stdout(io.StringIO()):
                    if code and not failure:
                        with self.assertRaisesRegex(ValueError, 'ssh-failed'): M.client(env)
                        self.assertFalse((Path(temporary)/'helmut-native-public').exists())
                    else:
                        self.assertEqual(M.client(env), 1 if failure else 0)
                        output = (Path(temporary)/'helmut-native-public/RESPONSE.SAFE.json').read_bytes()
                        self.assertEqual(M.json_unique(output)['result'], result(cap, failure))
                        sidecar = (Path(temporary)/'helmut-native-public/RESPONSE.SAFE.sha256').read_text()
                        self.assertEqual(sidecar, M.digest(output)+'  RESPONSE.SAFE.json\n')
        with patch.object(M, 'transport_configuration', return_value=('100.96.83.67', 'PUBLIC', 'PRIVATE')), \
                patch.object(M, 'bounded_exchange') as exchange:
            with self.assertRaisesRegex(ValueError, 'host-denied'): M.client(environment())
            exchange.assert_not_called()


if __name__ == '__main__':
    unittest.main(verbosity=2)
