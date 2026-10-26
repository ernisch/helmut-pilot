"""Read only the retained V2 Context failure from the fixed 4a82 deployment.

No path selectors, process/unit queries, lifecycle calls or execution authority.
Temporary error publications are observed too: their losing writer may hold the
inner error while FIRST_ERROR contains only the supervisor's WORKER_FAILED.
"""
import hashlib
import json
import math
import os
import re
import stat
import time

CONTRACT_ID = 'context-failure-observation-20261026-v1'
SCHEMA = 'helmut-context-failure-observation-v1'
BASE = '/opt/helmut-native-test/automation-20261026'
CONTEXT_BASE = '/opt/helmut-native-test/docker28-context-20261026'
NAMESPACE = 'setup-context-daemon-binding-v2'
STATE_ROOT = BASE + '/' + NAMESPACE
FAILED_NONCE = 'e939e6fde87bf3f4fb8b1c69a1c2de8e633f6856ac270d832dddd27a3c6c0bcd'
FAILED_COMMIT = '4a82f5fee73e287377344326a238b141af5928b9'
FAILED_SOURCE = '67cc1cdfdcd1375dd78aef8fef8128879c0e8d0a072819af8096c48d2f32e3fe'
RESPONSE_SHA = 'd3660ad6164c873cced0100b14e81610fb409d9251c1c0d4df6fc59578034586'
RESULT_SHA = 'edfd4e3c227e0d20fa00d137419499f1d9e7cab6d34ae93ed35548200fa7be4a'
FAILED_CONTRACT = '725eca5a4784a6878e891424de4d38461620b57616a3e6f26f4a576e95b673f4'
PLAN = 'e6d463a634925a190d60d066c0fae2ba94b9f7f0a10a115b50b4f4018b1b35eb'
CASE = 'f707b8e21b9f5f0f1d4fc131de38cd615c0c8e6e7f87631574af6bf2b672efa0'
READER_SHA256 = 'edcc93c55404685d3637abb096589f90c02ec1fce2a0e75b54dc53003b269046'
METADATA_CONTRACT = 'b85cecc106ab2e2a40d19f02c8caa412e6e6e3f86c6ee4c5bfa18fbe712a2caf'
JOB_ROOT = STATE_ROOT + '/jobs/' + FAILED_NONCE
PREFIX = b'helmut-context-failure-request-v1\0'
CAP, OUTPUT_CAP, TEMP_CAP = 16384, 32768, 8
ASSETS = {
    'context.py': {'bytes': 49988, 'sha256': 'b525ab407357cc581eb32a7b8b5ba40e6674af24e0caacf3a216ec0e2c992360'},
    'driver.py': {'bytes': 11378, 'sha256': 'bb0e5c0dbb199930244b66620acd93a9a7d26f6bff5fd40d32c6d7a3dff44ee5'},
    'guard.py': {'bytes': 36676, 'sha256': '488d0c493a0aba6d0e44250c75a69046496d9baec382dd7195efc064bb82a554'},
    'image.py': {'bytes': 14419, 'sha256': '0af41991ae300395fba57afc5a1856f16c2b1167692acfb8ac36199afdb307a6'},
    'public.py': {'bytes': 15871, 'sha256': '1934c0fd09f3316b3e7088bc974925c3eebc719ca1ac512d9edde704cb3916bb'},
    'recovery.py': {'bytes': 15031, 'sha256': '5f0f430bf557ca0e8f103cd1e6b06e25703a2604826e1f2bb39c222609198eb1'},
    'restore.py': {'bytes': 22910, 'sha256': 'c77dba4fe7fcbe34b419a668c19d55262af30eeaaad6c43650290e38cf39bd88'}}
ROLES = {
    'root_response': BASE + '/results/' + FAILED_NONCE + '.json',
    'namespace_error': STATE_ROOT + '/FIRST_ERROR.PRIVATE.json',
    'namespace_error_pending': STATE_ROOT + '/FIRST_ERROR.PRIVATE.json.PENDING',
    'continuation_attempt': STATE_ROOT + '/ATTEMPT_CONTEXT.PRIVATE.json',
    'job': JOB_ROOT + '/JOB.PRIVATE.json',
    'job_error': JOB_ROOT + '/FIRST_ERROR.PRIVATE.json',
    'job_result_pending': JOB_ROOT + '/RESULT.PENDING.PRIVATE.json',
    'job_result': JOB_ROOT + '/RESULT.PRIVATE.json',
    'component_error': CONTEXT_BASE + '/CONTEXT_DAEMON_BINDING_V2_FIRST_ERROR.PRIVATE.json',
    'component_attempt': CONTEXT_BASE + '/CONTEXT_DAEMON_BINDING_V2_ATTEMPT.SAFE.json',
    'component_receipt_pending': CONTEXT_BASE + '/native-context-daemon-binding-v2-' + CASE + '/CONTEXT_RECEIPT.PENDING.SAFE.json',
    'component_receipt': CONTEXT_BASE + '/native-context-daemon-binding-v2-' + CASE + '/CONTEXT_RECEIPT.SAFE.json'}
JOB_NAMES = frozenset(ASSETS) | {'JOB.PRIVATE.json', 'ARM.PRIVATE.json', 'ACK.PRIVATE.json',
    'RESULT.PENDING.PRIVATE.json', 'RESULT.PRIVATE.json', 'FIRST_ERROR.PRIVATE.json'}
EXTRA_CONTEXT_CODES = frozenset('DAEMON_BOOT_ID DAEMON_EXE_CHANGED DAEMON_EXE_HASH DAEMON_EXE_IDENTITY '
    'DAEMON_EXE_LIMIT DAEMON_EXE_LINK_BINDING DAEMON_EXE_LINK_IDENTITY DAEMON_EXITED '
    'DAEMON_OBSERVATION_DEADLINE DAEMON_PROC_CHANGED DAEMON_PROC_FILESYSTEM'.split())
EXTRA_CODES = EXTRA_CONTEXT_CODES | frozenset(
    'OBSERVED_PUBLIC_READY_HASH OBSERVED_RECOVERY_READY_HASH SETUP_GUARD_FAILURE'.split())
CONFIG = {'schema': 'helmut-context-failure-read-contract-v1', 'contract_id': CONTRACT_ID,
    'failed_commit': FAILED_COMMIT, 'failed_source_sha256': FAILED_SOURCE,
    'failed_contract_sha256': FAILED_CONTRACT, 'failed_nonce': FAILED_NONCE,
    'failed_response_sha256': RESPONSE_SHA, 'failed_result_sha256': RESULT_SHA,
    'metadata_reader_sha256': READER_SHA256, 'metadata_contract_sha256': METADATA_CONTRACT,
    'job_assets': ASSETS, 'record_roles': sorted(ROLES), 'record_limit': CAP,
    'temporary_record_limit': TEMP_CAP, 'output_limit': OUTPUT_CAP,
    'read_only': True, 'native_qualified': False, 'native_go_consumed': False}


class Stop(Exception):
    @property
    def code(self): return self.args[0]


def need(value, code):
    if not value: raise Stop(code)


def encoded(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True,
                       allow_nan=False) + '\n').encode('ascii')


def sha(raw): return hashlib.sha256(raw).hexdigest()
def hex64(value): return type(value) is str and re.fullmatch('[a-f0-9]{64}', value) is not None


def bounded(deadline):
    need(type(deadline) in (int, float) and math.isfinite(deadline)
         and 0 < deadline - time.monotonic() <= 300, 'CONTEXT_FAILURE_DEADLINE')


def validate_capsule(capsule, source_sha256, now):
    need(type(capsule) is dict and set(capsule) == {'schema', 'contract_id', 'action',
        'source_sha256', 'contract_sha256', 'nonce', 'issued_at_utc', 'expires_at_utc'}
        and capsule['schema'] == 'helmut-context-failure-capsule-v1'
        and capsule['contract_id'] == CONTRACT_ID and capsule['action'] == 'inspect'
        and hex64(source_sha256) and capsule['source_sha256'] == source_sha256
        and capsule['contract_sha256'] == CONTRACT_SHA256 and hex64(capsule['nonce']),
        'CONTEXT_FAILURE_CAPSULE')
    need(type(now) in (int, float) and math.isfinite(now)
        and type(capsule['issued_at_utc']) is int and type(capsule['expires_at_utc']) is int
        and 0 < capsule['issued_at_utc'] < capsule['expires_at_utc']
        and capsule['expires_at_utc'] - capsule['issued_at_utc'] <= 300
        and capsule['issued_at_utc'] <= now <= capsule['expires_at_utc'], 'CONTEXT_FAILURE_CAPSULE_TIME')
    return capsule


def request_nonce(capsule):
    return sha(PREFIX + encoded(capsule))


def read_role(path, reader, deadline, expected_sha=None):
    """A missing leaf or parent needs two held nearest-ancestor observations."""
    bounded(deadline)
    candidate = path
    for _ in range(16):
        try:
            root, name, chain = reader['trusted_parent'](candidate)
            break
        except FileNotFoundError:
            if candidate in (BASE, CONTEXT_BASE):
                return None, {'state': 'UNKNOWN_PARENT_UNOBSERVED', 'sha256': None, 'bytes': None,
                              'metadata': None, 'absence': None}
            candidate = candidate.rsplit('/', 1)[0]
    else: raise Stop('CONTEXT_FAILURE_FIXED_PATH')
    try:
        before = reader['metadata'](os.fstat(root))
        try: os.stat(name, dir_fd=root, follow_symlinks=False)
        except FileNotFoundError:
            fresh, again, second_chain = reader['trusted_parent'](candidate)
            try:
                need(name == again and chain == second_chain
                     and before == reader['metadata'](os.fstat(root))
                     == reader['metadata'](os.fstat(fresh)), 'CONTEXT_FAILURE_ABSENCE_DRIFT')
                try: os.stat(again, dir_fd=fresh, follow_symlinks=False)
                except FileNotFoundError:
                    return None, {'state': 'ABSENT', 'sha256': None, 'bytes': None, 'metadata': None,
                        'absence': {'scope': 'LEAF' if candidate == path else 'PARENT',
                            'parent_metadata': before, 'chain_sha256': sha(encoded(chain))}}
                raise Stop('CONTEXT_FAILURE_ABSENCE_DRIFT')
            finally: os.close(fresh)
        need(candidate == path, 'CONTEXT_FAILURE_ABSENCE_DRIFT')
    finally: os.close(root)
    raw, binding = reader['read_fixed'](path, deadline, CAP, None, expected_sha, (0, 0), 0o600,
                                        allow_empty=True)
    return raw, {'state': 'UNKNOWN', **binding, 'absence': None}


def json_record(raw, reader):
    value, _ = reader['unique_json'](raw)
    need(type(value) is dict and raw == encoded(value), 'CONTEXT_FAILURE_RECORD_UNKNOWN')
    return value


def diagnostic(raw, binding, kind, reader, expected_result):
    row = {**binding, 'source_status': None, 'phase': None, 'code': None,
           'exception_type': None, 'errno': None}
    if raw is None: return row
    if kind not in ('namespace_error', 'namespace_error_pending', 'job_error', 'component_error',
                    'component_receipt_pending', 'component_receipt') \
            and not kind.startswith('job_temporary_error_'):
        row['state'] = 'UNKNOWN_UNACCEPTED'
        return row
    try:
        value = json_record(raw, reader)
        codes = reader['ERROR_CODES'] | EXTRA_CODES
        semantic = {}
        if kind in ('namespace_error', 'namespace_error_pending'):
            need(value == expected_result, 'CONTEXT_FAILURE_RECORD_UNKNOWN')
            semantic.update(source_status=value['status'], phase=value['phase'], code=value['code'])
        elif kind == 'component_error':
            need(set(value) == {'status', 'phase', 'code', 'exceptionType', 'errno', 'case_id',
                'globalEmptyAnchorsCreated', 'globalAnchorAttempts', 'mountState', 'lastAcknowledgedStep',
                'nativeQualified', 'nativeGOConsumed'}
                and value['status'] == 'FAIL_KEEP_PARTIAL_CONTEXT_NO_RETRY'
                and value['phase'] in ('preflight', 'attempt', 'private-mounts')
                and value['code'] in (reader['CONTEXT_ERROR_CODES'] | EXTRA_CONTEXT_CODES)
                and value['exceptionType'] in reader['EXCEPTION_TYPES']
                and value['case_id'] in (None, CASE) and value['nativeQualified'] is False
                and value['nativeGOConsumed'] is False
                and value['mountState'] == ('UNKNOWN' if value['phase'] == 'private-mounts' else 'NOT_STARTED')
                and (value['lastAcknowledgedStep'] is None or type(value['lastAcknowledgedStep']) is int
                     and -1 <= value['lastAcknowledgedStep'] <= 10), 'CONTEXT_FAILURE_RECORD_UNKNOWN')
            for key in ('globalEmptyAnchorsCreated', 'globalAnchorAttempts'):
                need(type(value[key]) is list and len(value[key]) <= 3
                     and all(type(item) is str and item in ('/workspace', '/opt/codex', '/opt/helmut-public-pr942')
                             for item in value[key]) and len(set(value[key])) == len(value[key]),
                     'CONTEXT_FAILURE_RECORD_UNKNOWN')
            semantic.update(source_status=value['status'], phase=value['phase'], code=value['code'],
                            exception_type=value['exceptionType'], errno=value['errno'])
        elif kind in ('component_receipt_pending', 'component_receipt'):
            need(set(value) == {'status', 'case_id', 'scope_sha256', 'stage_ready_sha256', 'daemon',
                'propagationWasPrivate', 'globalEmptyAnchorsCreated', 'mountTargets', 'canonicalProofs',
                'runnerUid', 'runnerGid', 'publicEnginePresent', 'publicEngineState', 'nativeQualified',
                'nativeGOConsumed', 'budgetParentCreated', 'publicCheckoutReadySHA256', 'publicCheckoutReceipt',
                'sourcePreparationKind', 'recoveryReadySHA256', 'historicalRestoreReceiptSHA256',
                'historicalStageSourceSHA256', 'restoreSourceSHA256'}
                and value['status'] == 'CONTEXT_PREPARED_NOT_NATIVE_QUALIFIED' and value['case_id'] == CASE
                and value['nativeQualified'] is False and value['nativeGOConsumed'] is False
                and value['budgetParentCreated'] is False
                and value['runnerUid'] == value['runnerGid'] == 1000
                and value['publicEnginePresent'] is True
                and value['publicEngineState'] == 'MOUNTED_REQUIRES_FRESH_SOURCE_ADMISSION'
                and value['sourcePreparationKind'] == 'ACCEPTED_LOCAL_PAX_RECOVERY',
                'CONTEXT_FAILURE_RECORD_UNKNOWN')
            row.update(state='UNKNOWN_UNACCEPTED', source_status=value['status'])
            return row
        else:
            need(set(value) == {'schema', 'status', 'phase', 'code', 'exception_type', 'errno',
                'native_qualified', 'native_go_consumed'}
                and value['schema'] == 'helmut-context-daemon-binding-v2-service-error-v1'
                and value['status'] == 'FAIL_KEEP_STATE_NO_RETRY' and value['phase'] in (None, 'context')
                and value['code'] in codes and value['exception_type'] in reader['EXCEPTION_TYPES']
                and value['native_qualified'] is False and value['native_go_consumed'] is False,
                'CONTEXT_FAILURE_RECORD_UNKNOWN')
            semantic.update(source_status=value['status'], phase=value['phase'], code=value['code'],
                            exception_type=value['exception_type'], errno=value['errno'])
        need(semantic.get('errno') is None or type(semantic['errno']) is int
             and -4095 <= semantic['errno'] <= 4095, 'CONTEXT_FAILURE_RECORD_UNKNOWN')
        row.update(state='PRESENT', **semantic)
    except Exception:
        pass
    return row


def job_membership(reader, deadline):
    bounded(deadline)
    root, _, chain = reader['trusted_parent'](JOB_ROOT + '/JOB.PRIVATE.json')
    try:
        before = reader['metadata'](os.fstat(root))
        need(stat.S_ISDIR(before[2]) and before[3:5] == [0, 0]
             and stat.S_IMODE(before[2]) == 0o700, 'CONTEXT_FAILURE_JOB_DIRECTORY')
        names, temps = [], []
        with os.scandir(root) as entries:
            for entry in entries:
                bounded(deadline); name = entry.name
                need(name in JOB_NAMES or re.fullmatch('[.]setup-write-[a-f0-9]{32}[.]tmp', name),
                     'CONTEXT_FAILURE_JOB_MEMBERSHIP')
                names.append(name)
                if name not in JOB_NAMES: temps.append(name)
                need(len(temps) <= TEMP_CAP and len(names) <= len(JOB_NAMES) + TEMP_CAP,
                     'CONTEXT_FAILURE_JOB_LIMIT')
        fresh, _, again = reader['trusted_parent'](JOB_ROOT + '/JOB.PRIVATE.json')
        try:
            need(chain == again and before == reader['metadata'](os.fstat(root))
                 == reader['metadata'](os.fstat(fresh)), 'CONTEXT_FAILURE_JOB_DRIFT')
        finally: os.close(fresh)
        return {'state': 'PRESENT', 'sha256': sha(encoded(sorted(names))), 'metadata': before,
                'member_count': len(names), 'temporary_record_count': len(temps)}, sorted(temps)
    finally: os.close(root)


def bound_job(raw, reader):
    value = json_record(raw, reader)
    need(set(value) == {'schema', 'request', 'controller_source_sha256', 'plan_sha256', 'case_id', 'phase',
        'boot_id', 'deadline', 'runtime_seconds', 'controller', 'phase_data', 'assets', 'job_namespace'}
        and value['schema'] == 'helmut-context-daemon-binding-v2-service-job-v1'
        and value['request'] == {'schema': 'helmut-native-control-request-v1', 'operation': 'admit',
            'nonce': FAILED_NONCE, 'plan_sha256': PLAN, 'payload_sha256': FAILED_SOURCE}
        and value['controller_source_sha256'] == FAILED_SOURCE and value['plan_sha256'] == PLAN
        and value['case_id'] == CASE and value['phase'] == 'context'
        and value['job_namespace'] == NAMESPACE and value['assets'] == ASSETS,
        'CONTEXT_FAILURE_JOB_BINDING')
    return value


def snapshot(reader, deadline):
    raw, binding = read_role(ROLES['root_response'], reader, deadline, RESPONSE_SHA)
    need(raw is not None and binding['sha256'] == RESPONSE_SHA, 'CONTEXT_FAILURE_RESPONSE_BINDING')
    response = json_record(raw, reader)
    need(set(response) == {'schema', 'operation', 'nonce', 'plan_sha256', 'payload_sha256', 'result', 'result_sha256'}
        and response['schema'] == 'helmut-native-control-response-v1' and response['operation'] == 'admit'
        and response['nonce'] == FAILED_NONCE and response['plan_sha256'] == PLAN
        and response['payload_sha256'] == FAILED_SOURCE and response['result_sha256'] == RESULT_SHA
        and sha(encoded(response['result'])[:-1]) == RESULT_SHA, 'CONTEXT_FAILURE_RESPONSE_BINDING')
    expected = {'schema': 'helmut-context-continuation-result-v1', 'status': 'FAIL_KEEP_STATE_NO_RETRY',
        'contract_id': NAMESPACE, 'contract_sha256': FAILED_CONTRACT, 'phase': 'context', 'code': 'WORKER_FAILED',
        'authority_sha256': None, 'attempt_sha256': None, 'ready_sha256': None, 'accepted_sha256': None,
        'lifecycle_sha256': None, 'native_qualified': False, 'native_go_consumed': False}
    need(response['result'] == expected, 'CONTEXT_FAILURE_RESPONSE_BINDING')
    directory, temps = job_membership(reader, deadline)
    records = {'root_response': diagnostic(raw, binding, 'root_response', reader, expected)}
    for role, path in ROLES.items():
        if role == 'root_response': continue
        value, evidence = read_role(path, reader, deadline)
        if role == 'job':
            need(value is not None, 'CONTEXT_FAILURE_JOB_BINDING'); bound_job(value, reader)
        records[role] = diagnostic(value, evidence, role, reader, expected)
        if role == 'job': records[role]['state'] = 'PRESENT'
    for index, name in enumerate(temps):
        role = 'job_temporary_error_' + str(index)
        value, evidence = read_role(JOB_ROOT + '/' + name, reader, deadline)
        records[role] = diagnostic(value, evidence, role, reader, expected)
    return {'records': records, 'job_directory': directory}


def result_base(context):
    return {'schema': SCHEMA, 'contract_id': CONTRACT_ID, 'contract_sha256': CONTRACT_SHA256,
        'source_sha256': context.get('source_sha256') if type(context) is dict and hex64(context.get('source_sha256')) else None,
        'deployment_commit': context.get('deployment_commit') if type(context) is dict
            and type(context.get('deployment_commit')) is str and re.fullmatch('[a-f0-9]{40}', context['deployment_commit']) else None,
        'failed_commit': FAILED_COMMIT, 'failed_source_sha256': FAILED_SOURCE,
        'failed_nonce': FAILED_NONCE, 'failed_response_sha256': RESPONSE_SHA, 'failed_result_sha256': RESULT_SHA,
        'read_only': True, 'native_qualified': False, 'native_go_consumed': False}


def observe_context_failure(context, metadata_reader, qualified):
    """Trusted loader context only; the outer route binds the fresh read capsule."""
    try:
        need(os.getuid() == os.geteuid() == os.getgid() == os.getegid() == 0, 'CONTEXT_FAILURE_ROOT_REQUIRED')
        need(type(context) is dict and set(context) == {'base', 'source_sha256', 'deployment_commit', 'deadline'}
            and context['base'] == BASE and hex64(context['source_sha256'])
            and type(context['deployment_commit']) is str and re.fullmatch('[a-f0-9]{40}', context['deployment_commit']),
            'CONTEXT_FAILURE_CONTEXT')
        bounded(context['deadline'])
        need(sha(encoded(CONFIG)) == CONTRACT_SHA256 and type(metadata_reader) is dict
            and type(metadata_reader.get('__source_bytes__')) is bytes
            and sha(metadata_reader['__source_bytes__']) == READER_SHA256
            and metadata_reader.get('CONTRACT_SHA256') == METADATA_CONTRACT,
            'CONTEXT_FAILURE_SOURCE_PIN')
        metadata_reader['validate_config'](qualified)
        before = snapshot(metadata_reader, context['deadline'])
        need(snapshot(metadata_reader, context['deadline']) == before, 'CONTEXT_FAILURE_SNAPSHOT_DRIFT')
        metadata_reader['validate_config'](qualified)
        causes = sorted(role for role, row in before['records'].items()
                        if row['state'] == 'PRESENT' and row['code'] not in (None, 'WORKER_FAILED'))
        result = {**result_base(context), 'status': 'CONTEXT_FAILURE_OBSERVED_NOT_READY', 'code': None,
            'records': before['records'], 'job_directory': before['job_directory'],
            'snapshot_sha256': sha(encoded(before)), 'cause_records': causes,
            'cause_state': 'STORED_INNER_ERROR_OBSERVED' if causes else 'UNKNOWN_INNER_ERROR_ABSENT_OR_UNRECOGNIZED'}
        need(len(encoded(result)) <= OUTPUT_CAP, 'CONTEXT_FAILURE_OUTPUT_LIMIT')
        bounded(context['deadline'])
        return result
    except BaseException as error:
        code = getattr(error, 'code', None)
        if type(code) is not str or not re.fullmatch('[A-Z][A-Z0-9_]{0,63}', code):
            code = 'CONTEXT_FAILURE_IO_OR_FORMAT'
        return {**result_base(context), 'status': 'FAIL_CLOSED_NOT_NATIVE_QUALIFIED', 'code': code,
            'records': None, 'job_directory': None, 'snapshot_sha256': None, 'cause_records': [],
            'cause_state': 'UNKNOWN_READ_NOT_QUALIFIED'}


CONTRACT_SHA256 = sha(encoded(CONFIG))


if __name__ == '__main__':
    print('{"status":"NOT_EXECUTED_QUALIFIED_READ_ROUTE_ONLY"}')
    raise SystemExit(2)
