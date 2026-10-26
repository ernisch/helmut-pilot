"""Read only: one fixed SAFE dataset after four sealed setup acceptances.

Only the qualified source loader may supply config bytes and namespaces. No
paths, sources, release flags, limits or baseline hashes come from wire input.
"""
import base64
import hashlib
import json
import math
import os
import re
import stat
import time

BASE = '/opt/helmut-native-test/automation-20261026'
NAMESPACE = 'setup-successor-unit-properties-v1'
PHASES = ('recover', 'checkout', 'context', 'image')
CASE = 'f707b8e21b9f5f0f1d4fc131de38cd615c0c8e6e7f87631574af6bf2b672efa0'
SCOPE_SHA = '08fafd5ec430fff7a5dbb0d4822933f1350b1a639edde63fb82cae2ff8d862bd'
MEMBER = ('files/workspace/helmut-ram-fix-20261020/architecture-correction-20261020/'
          'native-auth-input-preparation/READONLY_RUNTIME_BINDINGS.SAFE.json')
RESTORED = BASE + '/stage-' + CASE + '/restored-pax-recovery'
LEAF = RESTORED + '/' + MEMBER
SCOPE_FILE = RESTORED + '/SOURCE_SCOPE.PRIVATE.json'
FILE_BYTES = 207733
FILE_SHA = '71e661eeaa3a71c74a7dc9aa7d5cf6568e12f728365f2a3b97fa08c1e8076475'
CHUNK_BYTES, CHUNKS, OUTPUT_CAP = 65536, 4, 131072
CONTRACT_ID = 'runtime-metadata-20261026-v1'
MODULE_PINS = {
    'library': {'repoFile': 'hetzner-native-setup-coordinator.py', 'bytes': 23644,
                'sha256': '0bec349c325d402e1357e77a8238e98ede64cf59047d712d93afcaecc19bbb2d'},
    'successor': {'repoFile': 'hetzner-native-setup-successor.py', 'bytes': 41531,
                  'sha256': '43f837860b111924aef3da593c8f808c773fd617ad06cad3c1279c4416b0ead9'},
    'preflight': {'repoFile': 'hetzner-native-setup-successor-preflight.py', 'bytes': 17455,
                  'sha256': 'a49d1991fce3e9afc1ba5e83f7cbac66feadda52d9f5f0eeb9f8123e7094fc62'},
    'guard.py': {'repoFile': 'hetzner-native-setup-service.py', 'bytes': 37312,
                 'sha256': 'b748266c62b899764aa042be62937607f564641dd66163811ee7e363366bc662'},
    'driver.py': {'repoFile': 'hetzner-native-setup-driver.py', 'bytes': 11824,
                  'sha256': 'e2bb2bb06ef259ba7be5814f7a7535a265988d62470a85fc7c3e26cbe158d14f'},
    'recovery.py': {'repoFile': 'hetzner-native-local-restore-recovery.py', 'bytes': 15031,
                    'sha256': '5f0f430bf557ca0e8f103cd1e6b06e25703a2604826e1f2bb39c222609198eb1'},
    'restore.py': {'repoFile': 'hetzner-native-stage-restore.py', 'bytes': 22910,
                   'sha256': 'c77dba4fe7fcbe34b419a668c19d55262af30eeaaad6c43650290e38cf39bd88'},
    'public.py': {'repoFile': 'hetzner-native-public-checkout.py', 'bytes': 15871,
                  'sha256': '1934c0fd09f3316b3e7088bc974925c3eebc719ca1ac512d9edde704cb3916bb'},
    'context.py': {'repoFile': 'hetzner-native-context.py', 'bytes': 43560,
                   'sha256': '1ee9b47014bb0227cb385dd248990980c0083dcca167d88838590fbbe538cfa9'},
    'image.py': {'repoFile': 'hetzner-native-budget-image-import.py', 'bytes': 14311,
                 'sha256': 'd355adfcd0a0a87cc1306170b5b8c0601bf9e8d9661af53609eb381dad4c337a'}}
SETUP_CONFIG = {'schema': 'helmut-runtime-metadata-read-contract-v1', 'contract_id': CONTRACT_ID,
    'setup_qualification_commit': '1370a6e4c757ffc3fb877bcfed7b164e8e352256',
    'setup_deployment_commit': '18c2736ac4da2cf946ccb4494ad2963091de7d32',
    'setup_server_sha256': 'afbccf72ad9f60ea84091567268c3b7927bcc6df9d99dac0c5da61e27e546a85',
    'contract_sha256': '029d6e301758fd27172a58c03ae99ae2003f93f84c37959192ad1124a93a5738',
    'asset_set_sha256': '9941129431d0575caa1afe9afab497fd7d111c18ede0566b5498ec5089751c07',
    'scope_sha256': SCOPE_SHA, 'dataset_sha256': FILE_SHA, 'dataset_bytes': FILE_BYTES,
    'member': MEMBER, 'modules': MODULE_PINS, 'read_only': True,
    'released_safe_sha256': FILE_SHA, 'native_qualified': False, 'native_go_consumed': False}
R = os.O_RDONLY | os.O_NOFOLLOW | os.O_NOATIME | os.O_NONBLOCK | os.O_CLOEXEC
D = os.O_PATH | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
MODULE_NAMES = {'library', 'successor', 'preflight', 'guard.py', 'driver.py', 'recovery.py',
                'restore.py', 'public.py', 'context.py', 'image.py'}


class Stop(Exception):
    @property
    def code(self): return self.args[0]


def need(value, code):
    if not value: raise Stop(code)


def sha(raw): return hashlib.sha256(raw).hexdigest()
def hex64(value): return type(value) is str and re.fullmatch('[a-f0-9]{64}', value) is not None
def encoded(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True, allow_nan=False) + '\n').encode('ascii')
def metadata(info):
    return [getattr(info, key) for key in ('st_dev', 'st_ino', 'st_mode', 'st_uid', 'st_gid',
        'st_nlink', 'st_size', 'st_atime_ns', 'st_mtime_ns', 'st_ctime_ns', 'st_rdev', 'st_blocks')]


def bounded(deadline):
    need(type(deadline) in (int, float) and math.isfinite(deadline)
         and 0 < deadline - time.monotonic() <= 300, 'METADATA_DEADLINE')


def unique_json(raw):
    def pairs(rows):
        value = {}
        for key, item in rows:
            need(key not in value, 'METADATA_DUPLICATE_JSON')
            value[key] = item
        return value
    text = raw.decode('utf-8', errors='strict')
    value = json.loads(text, object_pairs_hook=pairs,
                       parse_constant=lambda _: need(False, 'METADATA_JSON_CONSTANT'))
    stack, nodes, depth = [(value, 0)], 0, 0
    counts = dict.fromkeys(('dict', 'list', 'str', 'int', 'float', 'bool', 'NoneType'), 0)
    while stack:
        item, level = stack.pop(); nodes += 1; depth = max(depth, level)
        need(nodes <= 100000 and level <= 64, 'METADATA_JSON_LIMIT')
        kind = type(item).__name__
        need(type(item) in (dict, list, str, int, float, bool, type(None)), 'METADATA_JSON_TYPE')
        counts[kind] = counts.get(kind, 0) + 1
        if type(item) is float: need(math.isfinite(item), 'METADATA_JSON_CONSTANT')
        if type(item) is dict: stack.extend((child, level + 1) for child in item.values())
        if type(item) is list: stack.extend((child, level + 1) for child in item)
    summary = {'root_type': type(value).__name__, 'nodes': nodes, 'max_depth': depth,
               'type_counts': counts, 'ascii_only': raw.isascii(), 'utf8_valid': True,
               'schema_value_sha256': None}
    if type(value) is dict and type(value.get('schema')) is str:
        summary['schema_value_sha256'] = sha(value['schema'].encode('utf-8'))
    return value, summary


def trusted_parent(path):
    need(type(path) is str and path.startswith('/') and all(part not in ('', '.', '..')
         for part in path.split('/')[1:]), 'METADATA_FIXED_PATH')
    fd = os.open('/', D)
    chain = []
    try:
        info = os.fstat(fd)
        need(stat.S_ISDIR(info.st_mode) and info.st_uid == info.st_gid == 0
             and not stat.S_IMODE(info.st_mode) & 0o022, 'METADATA_PARENT_IDENTITY')
        prefix = ''
        for part in path.split('/')[1:-1]:
            prefix += '/' + part
            child = os.open(part, D, dir_fd=fd)
            try:
                info = os.fstat(child)
                need(stat.S_ISDIR(info.st_mode) and info.st_uid == info.st_gid == 0
                     and not stat.S_IMODE(info.st_mode) & 0o022, 'METADATA_PARENT_IDENTITY')
                if prefix == BASE: need(stat.S_IMODE(info.st_mode) == 0o700, 'METADATA_BASE_MODE')
            except BaseException:
                os.close(child)
                raise
            chain.append([prefix, metadata(info)])
            os.close(fd); fd = child
        readable = os.open('.', R | os.O_DIRECTORY, dir_fd=fd)
        try: need(metadata(os.fstat(readable)) == metadata(os.fstat(fd)), 'METADATA_PARENT_CHANGED')
        except BaseException:
            os.close(readable)
            raise
        os.close(fd)
        return readable, path.rsplit('/', 1)[1], chain
    except BaseException:
        os.close(fd)
        raise


def read_fixed(path, deadline, limit, expected_bytes, expected_sha, owner, mode):
    bounded(deadline)
    root, name, chain = trusted_parent(path)
    fd = fresh = None
    try:
        fd = os.open(name, R, dir_fd=root)
        info = os.fstat(fd); before = metadata(info)
        need(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and (info.st_uid, info.st_gid) == tuple(owner)
             and stat.S_IMODE(info.st_mode) == mode and 0 < info.st_size <= limit
             and (expected_bytes is None or info.st_size == expected_bytes), 'METADATA_LEAF_IDENTITY')
        raw, digest = bytearray(), hashlib.sha256()
        while True:
            bounded(deadline)
            block = os.read(fd, min(65536, limit + 1 - len(raw)))
            if not block: break
            raw.extend(block); digest.update(block)
            need(len(raw) <= limit, 'METADATA_FILE_LIMIT')
        fresh, again, second_chain = trusted_parent(path)
        need(again == name and second_chain == chain and len(raw) == info.st_size
             and before == metadata(os.fstat(fd))
             == metadata(os.stat(name, dir_fd=root, follow_symlinks=False))
             == metadata(os.stat(name, dir_fd=fresh, follow_symlinks=False)), 'METADATA_FILE_CHANGED')
        need(digest.hexdigest() == expected_sha, 'METADATA_FILE_HASH')
        return bytes(raw), {'sha256': digest.hexdigest(), 'bytes': len(raw), 'metadata': before}
    finally:
        for item in (fresh, fd, root):
            if item is not None: os.close(item)


def validate_config(qualified):
    config = SETUP_CONFIG
    need(hex64(CONTRACT_SHA256) and sha(encoded(config)) == CONTRACT_SHA256, 'METADATA_CONFIG_NOT_QUALIFIED')
    need(type(config) is dict and set(config) == {'schema', 'contract_id', 'setup_qualification_commit',
        'setup_deployment_commit', 'setup_server_sha256', 'contract_sha256', 'asset_set_sha256',
        'scope_sha256', 'dataset_sha256', 'dataset_bytes', 'member', 'modules', 'read_only',
        'released_safe_sha256', 'native_qualified', 'native_go_consumed'}
        and config['schema'] == 'helmut-runtime-metadata-read-contract-v1' and config['contract_id'] == CONTRACT_ID
        and config['setup_qualification_commit'] == '1370a6e4c757ffc3fb877bcfed7b164e8e352256'
        and type(config['setup_deployment_commit']) is str
        and re.fullmatch('[a-f0-9]{40}', config['setup_deployment_commit'])
        and all(hex64(config[key]) for key in ('setup_server_sha256', 'contract_sha256', 'asset_set_sha256'))
        and config['scope_sha256'] == SCOPE_SHA and config['dataset_sha256'] == FILE_SHA
        and config['dataset_bytes'] == FILE_BYTES and type(config['dataset_bytes']) is int
        and config['member'] == MEMBER and config['read_only'] is True
        and config['native_qualified'] is False and config['native_go_consumed'] is False
        and config['released_safe_sha256'] in (None, FILE_SHA), 'METADATA_BASELINE_NOT_READY')
    need(type(qualified) is dict and set(qualified) == MODULE_NAMES
         and type(config['modules']) is dict and set(config['modules']) == MODULE_NAMES, 'METADATA_MODULE_SET')
    for name in sorted(MODULE_NAMES):
        module, pin = qualified[name], config['modules'][name]
        need(type(module) is dict and type(module.get('__source_bytes__')) is bytes
             and type(pin) is dict and set(pin) == {'repoFile', 'sha256', 'bytes'}
             and type(pin['repoFile']) is str and re.fullmatch('hetzner-native-[a-z0-9-]+[.]py', pin['repoFile'])
             and type(pin['bytes']) is int
             and 0 < pin['bytes'] <= 131072 and len(module['__source_bytes__']) == pin['bytes']
             and sha(module['__source_bytes__']) == pin['sha256'], 'METADATA_MODULE_PIN')
    return config


def verify_setup_baseline(config, qualified, deadline):
    """Read-only reuse of the old qualified libraries; no admission/time renewal."""
    bounded(deadline)
    library, successor, preflight = (qualified[key] for key in ('library', 'successor', 'preflight'))
    guard, driver = qualified['guard.py'], qualified['driver.py']
    assets = {key: qualified[key]['__source_bytes__'] for key in library['FILES']}
    expected, asset_set = library['asset_pins']()
    need(asset_set == config['asset_set_sha256'], 'METADATA_SETUP_ASSETS')
    for name, raw in assets.items():
        need(expected[name] == {'sha256': sha(raw), 'bytes': len(raw)}, 'METADATA_SETUP_ASSETS')
    context = {'base': BASE, 'source_sha256': config['setup_server_sha256'],
               'deployment_commit': config['setup_deployment_commit'], 'deadline': deadline}
    captures = {}
    def capture(label, parent, name):
        raw, binding = successor['read_bound'](parent, name, library, deadline, 16384)
        captures[label] = binding
        return raw
    authority_raw = capture('authority', BASE, successor['AUTHORITY'])
    once_raw = capture('once', BASE + '/once', successor['ONCE'])
    authority = successor['parsed'](authority_raw)
    need(type(authority) is dict and authority.get('source_sha256') == context['source_sha256']
         and authority.get('deployment_commit') == context['deployment_commit']
         and authority.get('contract_sha256') == config['contract_sha256'], 'METADATA_AUTHORITY_BINDING')
    capsule = {'inspection_nonce': authority['inspection_nonce'],
               'inspection_result_sha256': authority['inspection_result_sha256']}
    report, inspection_binding = successor['saved_inspection'](capsule, context, config['contract_sha256'],
                                                             asset_set, library, deadline)
    need(authority_raw == successor['encoded'](successor['authority_value'](authority['admitted_by_nonce'],
        capsule, context, config['contract_sha256'], asset_set, report, inspection_binding)), 'METADATA_AUTHORITY_BINDING')
    authority_sha = sha(authority_raw)
    need(once_raw == encoded({'schema': 'helmut-setup-successor-once-v1', 'contract_id': NAMESPACE,
        'authority_sha256': authority_sha, 'state': 'ADMITTED_FIXED_FOUR_PHASES_NO_REARM'}), 'METADATA_ONCE_BINDING')
    history = preflight['collect_history'](deadline)
    need(preflight['history_summary'](history) == authority['history']
         and successor['runtime_snapshot'](history, guard, library, deadline) == authority['runtime'],
         'METADATA_HISTORICAL_DRIFT')
    state = library['directory'](BASE + '/' + NAMESPACE)
    try:
        accepted = library['accepted_chain'](state, context, asset_set, driver)
        need(len(accepted) == 4 and [row[0]['phase'] for row in accepted] == list(PHASES), 'METADATA_FOUR_ACCEPTED_REQUIRED')
        library['guard_jobs_check'](accepted, job_namespace=NAMESPACE)
        successor['state_check'](state, library, accepted, authority_sha, config['contract_sha256'], deadline)
        successor['verify_job_seals'](accepted, context, assets, expected, asset_set, authority_sha,
                                      config['contract_sha256'], guard, library, deadline)
        for phase in PHASES:
            marker_raw = capture('accepted:' + phase, BASE + '/' + NAMESPACE, library['marker_name'](phase))
            need(sha(marker_raw) == accepted[PHASES.index(phase)][1], 'METADATA_BASELINE_DRIFT')
            capture('seal:' + phase, BASE + '/' + NAMESPACE, successor['seal_name'](phase))
        # accepted_chain already rereads all12 physical bindings including the
        # recovery, context and image receipts. Semantic recovery proof is read
        # through its original pinned consumer, without Docker/source execution.
        ready = [row[0]['ready_sha256'] for row in accepted]
        qualified['context.py']['recovery_stage_proof'](ready[0], library['EXPECTED_OLD_RECEIPT'])
        paths = driver['paths']()
        context_raw, _ = driver['read'](paths['context_receipt'])
        context_receipt = successor['parsed'](context_raw)
        need(context_receipt.get('status') == 'CONTEXT_PREPARED_NOT_NATIVE_QUALIFIED'
             and context_receipt.get('sourcePreparationKind') == 'ACCEPTED_LOCAL_PAX_RECOVERY'
             and context_receipt.get('recoveryReadySHA256') == ready[0]
             and context_receipt.get('publicCheckoutReadySHA256') == ready[1]
             and context_receipt.get('nativeQualified') is False and context_receipt.get('nativeGOConsumed') is False,
             'METADATA_CONTEXT_RECEIPT')
        image_raw, _ = driver['read'](paths['image_receipt'])
        image = successor['parsed'](image_raw)
        need(image.get('schema') == 'helmut-original-budget-image-import-v1'
             and image.get('status') in ('IMPORTED_NOT_NATIVE_QUALIFIED', 'ALREADY_PRESENT_NOT_NATIVE_QUALIFIED')
             and image.get('image') == qualified['image.py']['_BI_IMAGE']
             and image.get('nativeQualified') is False and image.get('nativeGOConsumed') is False,
             'METADATA_IMAGE_RECEIPT')
        need(preflight['verify_history_unchanged'](history, deadline) is True, 'METADATA_HISTORICAL_DRIFT')
        successor['verify_job_seals'](accepted, context, assets, expected, asset_set, authority_sha,
                                      config['contract_sha256'], guard, library, deadline)
        return {'baseline_sha256': sha(encoded(captures)), 'bindings': captures,
                'historical_source_sha256': context['source_sha256'],
                'historical_deployment_commit': context['deployment_commit'],
                'setup_proof': {'schema': 'helmut-runtime-metadata-setup-proof-v1',
                    'source_sha256': context['source_sha256'], 'deployment_commit': context['deployment_commit'],
                    'contract_sha256': config['contract_sha256'], 'asset_set_sha256': asset_set,
                    'authority_sha256': authority_sha, 'once_sha256': sha(once_raw),
                    'accepted_sha256': {phase: captures['accepted:' + phase]['sha256'] for phase in PHASES},
                    'job_seal_sha256': {phase: captures['seal:' + phase]['sha256'] for phase in PHASES},
                    'baseline_sha256': sha(encoded(captures))}}
    finally: os.close(state)


def source_row(deadline):
    raw, binding = read_fixed(SCOPE_FILE, deadline, 2 * 1024**2, None, SCOPE_SHA, (0, 0), 0o600)
    scope, _ = unique_json(raw)
    need(type(scope) is dict and scope.get('schema') == 'helmut-encrypted-transport-scope-v4'
         and type(scope.get('items')) is list and len(scope['items']) == 1767
         and type(scope.get('regularFileCount')) is int and scope['regularFileCount'] == 1767,
         'METADATA_SOURCE_SCOPE')
    rows = [row for row in scope['items'] if type(row) is dict and row.get('archiveMember') == MEMBER]
    need(len(rows) == 1, 'METADATA_SOURCE_ROW')
    row = rows[0]
    need(row.get('path') == '/' + MEMBER[len('files/'):] and row.get('bytes') == FILE_BYTES
         and type(row.get('bytes')) is int and row.get('sha256') == FILE_SHA
         and type(row.get('uid')) is int and 0 <= row['uid'] < 2**32 - 1
         and type(row.get('gid')) is int and 0 <= row['gid'] < 2**32 - 1
         and type(row.get('mode')) is str and re.fullmatch('(?:0o)?[0-7]{1,4}', row['mode'])
         and 0 <= int(row['mode'], 8) <= 0o777, 'METADATA_SOURCE_ROW')
    return row, binding


def failure(code, context, chunk_index):
    if type(code) is not str or re.fullmatch('[A-Z][A-Z0-9_]{0,63}', code) is None:
        code = 'METADATA_IO_OR_FORMAT'
    return {'schema': 'helmut-runtime-binding-metadata-read-v1', 'status': 'FAIL_CLOSED_NOT_NATIVE_QUALIFIED',
        'contract_id': CONTRACT_ID, 'contract_sha256': CONTRACT_SHA256,
        'source_sha256': context.get('source_sha256') if type(context) is dict and hex64(context.get('source_sha256')) else None,
        'dataset_sha256': FILE_SHA, 'dataset_bytes': FILE_BYTES,
        'chunk_index': chunk_index if type(chunk_index) is int and 0 <= chunk_index < CHUNKS else None,
        'code': code, 'data_base64': None, 'native_qualified': False, 'native_go_consumed': False}


def read_runtime_metadata(chunk_index, context, qualified):
    """Only wire selector: one integer chunk_index0..3. Context is trusted loader data."""
    try:
        need(os.getuid() == os.geteuid() == os.getgid() == os.getegid() == 0, 'METADATA_ROOT_REQUIRED')
        need(type(chunk_index) is int and 0 <= chunk_index < CHUNKS, 'METADATA_CHUNK_INDEX')
        need(type(context) is dict and set(context) == {'base', 'source_sha256', 'deployment_commit', 'deadline'}
             and context['base'] == BASE and hex64(context['source_sha256'])
             and type(context['deployment_commit']) is str and re.fullmatch('[a-f0-9]{40}', context['deployment_commit']),
             'METADATA_CONTEXT')
        deadline = context['deadline']; bounded(deadline)
        config = validate_config(qualified)
        before = verify_setup_baseline(config, qualified, deadline)
        row, scope_binding = source_row(deadline)
        raw, file_binding = read_fixed(LEAF, deadline, FILE_BYTES, FILE_BYTES, FILE_SHA,
                                       (row['uid'], row['gid']), int(row['mode'], 8))
        _, summary = unique_json(raw)
        need(source_row(deadline) == (row, scope_binding)
             and verify_setup_baseline(config, qualified, deadline) == before, 'METADATA_BASELINE_DRIFT')
        result = {'schema': 'helmut-runtime-binding-metadata-read-v1',
            'status': 'SAFE_METADATA_CHUNK_NOT_NATIVE_QUALIFIED' if config['released_safe_sha256'] == FILE_SHA
                      else 'UNKNOWN_CONTENT_REVIEW_REQUIRED',
            'contract_id': CONTRACT_ID, 'contract_sha256': CONTRACT_SHA256, 'source_sha256': context['source_sha256'],
            'dataset_sha256': FILE_SHA, 'dataset_bytes': FILE_BYTES, 'file_binding': file_binding,
            'scope_sha256': scope_binding['sha256'], 'source_row_sha256': sha(encoded(row)),
            'setup_proof': before['setup_proof'],
            'chunk_index': chunk_index, 'chunk_count': CHUNKS, 'chunk_size': CHUNK_BYTES,
            'chunk_sha256': None, 'data_base64': None, 'json_summary': summary,
            'native_qualified': False, 'native_go_consumed': False}
        if config['released_safe_sha256'] == FILE_SHA:
            chunk = raw[chunk_index * CHUNK_BYTES:(chunk_index + 1) * CHUNK_BYTES]
            result.update(chunk_sha256=sha(chunk), data_base64=base64.b64encode(chunk).decode('ascii'))
        need(len(encoded(result)) <= OUTPUT_CAP, 'METADATA_OUTPUT_LIMIT')
        bounded(deadline)
        return result
    except BaseException as error:
        code = getattr(error, 'code', None)
        if type(code) is not str or re.fullmatch('[A-Z][A-Z0-9_]{0,63}', code) is None:
            code = 'METADATA_IO_OR_FORMAT'
        return failure(code, context, chunk_index)


CONTRACT_SHA256 = sha(encoded(SETUP_CONFIG))


if __name__ == '__main__':
    print('{"status":"NOT_EXECUTED_COMPONENT_ONLY"}')
    raise SystemExit(2)
