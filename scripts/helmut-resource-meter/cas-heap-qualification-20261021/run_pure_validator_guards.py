#!/usr/bin/env python3
"""Unexecuted V2 source-only guard preparation with native OID-string fixtures. Root alone runs this resource-free check.
Usage: python -I -S -B run_pure_validator_guards.py <frozen worker.py>
Only seven pinned pure FunctionDef nodes execute; worker top level never executes.
"""
import ast
import copy
import hashlib
import json
from pathlib import Path
import re
import sys
from types import SimpleNamespace

NAMES = (
    'validate_observer_view_definition', 'validate_observer_state',
    'validate_observer_readback', 'validate_observer_selected',
    'validate_observer_restored', 'validate_metadata_namespace', 'validate_server_heap',
)
DATABASE = 'helmut_resource_fixture_20261020_3b3bf56650bc'
CLONE = 'a' * 64
COLUMNS = ['name', 'ident', 'parent', 'level', 'total_bytes', 'total_nblocks',
           'free_bytes', 'free_chunks', 'used_bytes']
TYPES = ['25', '25', '25', '23', '20', '20', '20', '20', '20']
VIEW = ('SELECT pg_get_backend_memory_contexts.name, pg_get_backend_memory_contexts.ident, '
        'pg_get_backend_memory_contexts.parent, pg_get_backend_memory_contexts.level, '
        'pg_get_backend_memory_contexts.total_bytes, pg_get_backend_memory_contexts.total_nblocks, '
        'pg_get_backend_memory_contexts.free_bytes, pg_get_backend_memory_contexts.free_chunks, '
        'pg_get_backend_memory_contexts.used_bytes '
        'FROM pg_catalog.pg_get_backend_memory_contexts() pg_get_backend_memory_contexts'
        '(name, ident, parent, level, total_bytes, total_nblocks, free_bytes, free_chunks, used_bytes);')
PREFIX = b'HELMUT_CAS_HEAP_V1 '


def load_pure(path):
    text = path.read_text()
    metadata = json.loads((Path(__file__).resolve().parent / 'SOURCE_BINDING.SAFE.json').read_text())
    matches = list(re.finditer(r'^def ([A-Za-z_][A-Za-z_0-9]*)\(', text, re.M))
    spans = {m[1]: text[m.start():matches[i+1].start() if i+1 < len(matches) else len(text)]
             for i, m in enumerate(matches)}
    for name in NAMES:
        if name not in spans or hashlib.sha256(spans[name].encode()).hexdigest() != metadata['functionBlockSHA256'][name]:
            raise RuntimeError('pinned pure function changed: ' + name)
    tree = ast.parse(text, filename=str(path))
    nodes = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in NAMES]
    if {node.name for node in nodes} != set(NAMES) or len(nodes) != len(NAMES):
        raise RuntimeError('exactly seven pure function definitions required')
    for node in nodes:
        if node.decorator_list or any(not isinstance(v, ast.Constant) or v.value is not None
                                      for v in [*node.args.defaults, *[v for v in node.args.kw_defaults if v is not None]]):
            raise RuntimeError('executable definition metadata forbidden')
        if any(isinstance(item, (ast.Import, ast.ImportFrom)) for item in ast.walk(node)):
            raise RuntimeError('subject imports forbidden even inside validators')
    def require(ok, reason):
        if not ok:
            raise RuntimeError(reason)
    def uuid4(value):
        return type(value) is str and re.fullmatch(
            r'[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}', value)
    fake = SimpleNamespace(require=require, uuid4=uuid4, QUERY_LIMIT=262144, DATABASE=DATABASE)
    namespace = {'C': fake, 'json': json, 'hashlib': hashlib, 're': re}
    exec(compile(ast.Module(body=nodes, type_ignores=[]), '<pinned pure validators>', 'exec'), namespace)
    return namespace


def observer_state(effective=False, nullable=False):
    def acl(privilege):
        return [{'ordinal': 1, 'grantor': '10', 'grantee': '10', 'privilege': privilege, 'grantable': False},
                {'ordinal': 2, 'grantor': '10', 'grantee': '3373', 'privilege': privilege, 'grantable': False}]
    view = {
        'oid': '12025', 'schema': 'pg_catalog', 'schemaOID': '11', 'schemaOwnerOID': '10',
        'kind': 'v', 'ownerOID': '10', 'definition': VIEW,
        'definitionSHA256': hashlib.sha256(VIEW.encode()).hexdigest(),
        'columns': [{'number': i+1, 'name': n, 'typeOID': t, 'typeModifier': -1, 'notNull': False}
                    for i, (n, t) in enumerate(zip(COLUMNS, TYPES))],
        'rawACL': None if nullable else '{postgres=r/postgres,pg_read_all_stats=r/postgres}',
        'aclExpanded': [] if nullable else acl('SELECT'), 'effective': effective,
    }
    function = {
        'oid': '2282', 'schema': 'pg_catalog', 'schemaOID': '11', 'schemaOwnerOID': '10', 'ownerOID': '10',
        'name': 'pg_get_backend_memory_contexts', 'language': 'internal', 'languageOID': '12',
        'argumentCount': 0, 'argumentTypes': '',
        'allArgumentTypes': '{25,25,25,23,20,20,20,20,20}',
        'argumentModes': '{o,o,o,o,o,o,o,o,o}',
        'argumentNames': '{name,ident,parent,level,total_bytes,total_nblocks,free_bytes,free_chunks,used_bytes}',
        'returnType': '2249', 'setReturning': True, 'securityDefiner': False, 'volatility': 'v',
        'config': None, 'source': 'pg_get_backend_memory_contexts',
        'sourceSHA256': hashlib.sha256(b'pg_get_backend_memory_contexts').hexdigest(),
        'rawACL': None if nullable else '{postgres=X/postgres,pg_read_all_stats=X/postgres}',
        'aclExpanded': [] if nullable else acl('EXECUTE'), 'effective': effective,
    }
    return {
        'schema': 'helmut-cas-heap-observer-acl-state/1',
        'binding': {'cloneReceiptSHA256': CLONE, 'database': DATABASE, 'databaseOID': '18405',
                    'dataDirectory': '/disk/pgdata', 'serverVersionNum': '170006',
                    'currentUser': 'postgres', 'sessionUser': 'postgres',
                    'logErrorVerbosity': 'terse', 'logMinErrorStatement': 'fatal'},
        'role': {'oid': '20001', 'name': 'service_role', 'super': False, 'inherit': True,
                 'createRole': False, 'createDB': False, 'canLogin': False, 'replication': False,
                 'bypassRLS': True, 'connectionLimit': -1, 'validUntil': None, 'config': None},
        'memberships': [{'oid': '8001', 'roleid': '10' if effective and nullable else '3373',
                         'member': '20001' if effective and nullable else '20002', 'grantor': '10',
                         'adminOption': False, 'inheritOption': True, 'setOption': True}],
        'objects': {'view': view, 'function': function},
    }


def selected_state(before):
    result = copy.deepcopy(before)
    for name, privilege, aclchar in [('view', 'SELECT', 'r'), ('function', 'EXECUTE', 'X')]:
        obj = result['objects'][name]
        if not obj['effective']:
            obj['effective'] = True
            obj['rawACL'] = obj['rawACL'][:-1] + ',service_role=' + aclchar + '/postgres}'
            obj['aclExpanded'].append({'ordinal': 3, 'grantor': '10', 'grantee': before['role']['oid'],
                                       'privilege': privilege, 'grantable': False})
    return result


def revision(i):
    return '00000000-0000-4000-8000-' + format(i, '012d')


def heap_fixture():
    requests = []
    records = []
    for i in range(3):
        requests.append({'uMethod': 'read', 'phase': 'round' + str(i) + '.read'})
        requests.append({'uMethod': 'write', 'phase': 'round' + str(i) + '.mutation',
                         'responseReceived': True, 'selectedUAccepted': True,
                         'expectedRevision': revision(i), 'revision': revision(i+1)})
        requests += [{'uMethod': 'readControl', 'phase': 'control'} for _ in range(6)]
    requests += [{'uMethod': 'read', 'phase': 'beforeRestore'},
                 {'uMethod': 'write', 'phase': 'restore.write', 'responseReceived': True,
                  'selectedUAccepted': True, 'expectedRevision': revision(3), 'revision': revision(4)},
                 {'uMethod': 'read', 'phase': 'finalRead'}]
    for i in range(4):
        common = {'schema': 'helmut-cas-heap-log/1', 'backendPID': 21001+i % 2,
                  'xid': str(10001+i), 'expectedRevision': revision(i), 'newRevision': revision(i+1),
                  'currentUser': 'service_role', 'sessionUser': 'postgres',
                  'rawProjection': None, 'rawDiagnosticScope': None,
                  'logErrorVerbosity': 'terse', 'logMinErrorStatement': 'fatal'}
        records.append({**common, 'kind': 'cas', 'point': 'session'})
        for point in ['beforeOutputText', 'afterOutputValue']:
            after = point == 'afterOutputValue'
            records.append({**common, 'kind': 'heap', 'point': point,
                            'contextCount': 12+i, 'totalBytes': 40960 + int(after)*4096,
                            'usedBytes': 32768 + int(after)*4096, 'freeBytes': 8192,
                            'outputTextBytes': 1730 if after else None,
                            'outputValueBytes': 2195 if after else None})
    return records, {'pass': True, 'requests': requests}


def encode_records(records):
    return b'database system is ready to accept connections\n' + b'\n'.join(
        ('2026-10-21 12:34:56.123 UTC [' + str(row['backendPID']) + '] LOG:  ').encode()
        + PREFIX + json.dumps(row, separators=(',', ':'), ensure_ascii=False).encode()
        for row in records) + b'\n'


def run_guards(ns):
    checks = 0
    def passed(label):
        nonlocal checks
        checks += 1
    def accepts(label, function, *args):
        try:
            result = function(*args)
        except Exception as error:
            raise RuntimeError(label + ': valid input rejected: ' + type(error).__name__ + ': ' + str(error)) from error
        passed(label)
        return result
    def rejects(label, function, *args):
        try:
            function(*args)
        except (RuntimeError, ValueError, TypeError, KeyError, OverflowError, UnicodeError):
            passed(label)
            return
        raise RuntimeError(label + ': invalid input accepted')
    view = ns['validate_observer_view_definition']
    state = ns['validate_observer_state']
    readback = ns['validate_observer_readback']
    selected = ns['validate_observer_selected']
    restored = ns['validate_observer_restored']
    namespace = ns['validate_metadata_namespace']
    heap = ns['validate_server_heap']

    # Positive fixtures establish real API wiring before negative mutations.
    records, observed = heap_fixture()
    proof = accepts('four accepted CAS and eight frames', heap, encode_records(records), observed, 'cas-heap')
    if proof['diagnosticRecords'] != 12 or proof['CASBinderRecords'] != 4 or proof['heapRecords'] != 8:
        raise RuntimeError('parsed proof counts changed')
    if proof['groupPeakOwnerClaimed'] is not False or proof['causalityOrSavingsClaimed'] is not False:
        raise RuntimeError('proof overstates cause or saving')
    passed('no owner or RAM claim')
    for raw_value in ['', 'off', 'default-but-observed']:
        changed = copy.deepcopy(records)
        for row in changed:
            row['rawProjection'] = raw_value
            row['rawDiagnosticScope'] = 'a-local-scope'
        accepts('raw non-on GUC preserved ' + repr(raw_value), heap, encode_records(changed), observed, 'cas-heap')
    changed = copy.deepcopy(records)
    for row in changed:
        row['rawProjection'] = 'CONTEXT: observed string'
        row['rawDiagnosticScope'] = 'STATEMENT: observed string'
    accepts('severity words inside scalar GUC are not extra log lines', heap, encode_records(changed), observed, 'cas-heap')
    accepts('zero Auth lifecycle', heap, b'database system is shut down\n', None, 'lifecycle-only')
    changed = copy.deepcopy(records)
    changed[1]['contextCount'] = 4096
    accepts('inclusive context result cap', heap, encode_records(changed), observed, 'cas-heap')

    # Correlation and protocol mutations target independent failure categories.
    for label, alter in [
        ('missing last frame', lambda x: x.pop()),
        ('extra full record', lambda x: x.append(copy.deepcopy(x[-1]))),
        ('before/after ordering', lambda x: x.__setitem__(slice(1,3), list(reversed(x[1:3])))),
        ('cross frame PID', lambda x: x[1].__setitem__('backendPID', 29999)),
        ('cross frame XID', lambda x: x[2].__setitem__('xid', '55555')),
        ('bool is not heap int', lambda x: x[1].__setitem__('usedBytes', True)),
        ('NaN is not counter', lambda x: x[1].__setitem__('totalBytes', float('nan'))),
        ('negative allocator bytes', lambda x: x[1].__setitem__('freeBytes', -1)),
        ('accounting mismatch', lambda x: x[1].__setitem__('totalBytes', 40961)),
        ('context count above cap', lambda x: x[1].__setitem__('contextCount', 4097)),
        ('before length unknown', lambda x: x[1].__setitem__('outputTextBytes', 0)),
        ('after length must integer', lambda x: x[2].__setitem__('outputValueBytes', True)),
        ('unrequested context names', lambda x: x[1].__setitem__('contextNames', ['private-object'])),
        ('GUC bool forbidden', lambda x: x[0].__setitem__('rawProjection', False)),
        ('overlong raw GUC', lambda x: x[0].__setitem__('rawDiagnosticScope', 'x'*129)),
        ('nonterse logging', lambda x: x[0].__setitem__('logErrorVerbosity', 'default')),
        ('statement logging enabled', lambda x: x[0].__setitem__('logMinErrorStatement', 'error')),
    ]:
        changed = copy.deepcopy(records)
        alter(changed)
        rejects(label, heap, encode_records(changed), observed, 'cas-heap')
    changed = copy.deepcopy(records)
    for row in changed:
        row['rawProjection'] = 'on'
    rejects('projection ON before unsafe branch', heap, encode_records(changed), observed, 'cas-heap')
    changed = copy.deepcopy(records)
    for row in changed[3:6]:
        row['xid'] = changed[0]['xid']
    rejects('duplicate assigned transaction', heap, encode_records(changed), observed, 'cas-heap')
    changed = copy.deepcopy(records)
    changed_observed = copy.deepcopy(observed)
    for row in changed[9:12]:
        row['newRevision'] = revision(1)
    changed_observed['requests'][25]['revision'] = revision(1)
    rejects('duplicate accepted revision', heap, encode_records(changed), changed_observed, 'cas-heap')
    raw = encode_records(records)
    rejects('duplicate JSON field', heap, raw.replace(b'{"schema":', b'{"backendPID":21001,"schema":', 1), observed, 'cas-heap')
    rejects('actual log envelope PID', heap, raw.replace(b'[21001]', b'[29999]', 1), observed, 'cas-heap')
    rejects('single record JSON byte cap', heap, raw.replace(b'{"schema":', b'{' + b' '*2048 + b'"schema":', 1), observed, 'cas-heap')
    rejects('whole log cap', heap, b'x'*262145, observed, 'cas-heap')
    rejects('lifecycle emits no observer data', heap, raw, None, 'lifecycle-only')
    for severity in [b'CONTEXT: PL/pgSQL fake context\n', b'STATEMENT: SELECT fake_payload\n']:
        rejects('no raw context or statement payload', heap, raw+severity, observed, 'cas-heap')
    changed_observed = copy.deepcopy(observed)
    changed_observed['requests'][25]['revision'] = revision(99)
    rejects('driver revision binds actual restore', heap, raw, changed_observed, 'cas-heap')
    changed_observed = copy.deepcopy(observed)
    changed_observed['requests'][25]['selectedUAccepted'] = False
    rejects('unaccepted restore does not qualify', heap, raw, changed_observed, 'cas-heap')

    accepts('complete official nine column view', view, VIEW)
    plain = 'SELECT '+', '.join(COLUMNS)+' FROM pg_get_backend_memory_contexts();'
    accepts('unqualified deparser form with separate namespace gate', view, plain)
    quoted = 'SELECT '+', '.join('\"'+name+'\"' for name in COLUMNS)+' FROM \"pg_catalog\".\"pg_get_backend_memory_contexts\"();'
    accepts('lowercase exact quoted builtin identifiers', view, quoted)
    for label, text in [
        ('WHERE suffix', VIEW[:-1]+' WHERE true;'),
        ('JOIN suffix', VIEW[:-1]+' JOIN public.fake ON true;'),
        ('UNION suffix', VIEW[:-1]+' UNION SELECT 1;'),
        ('second statement', VIEW+' SELECT 1;'),
        ('column expression', VIEW.replace('pg_get_backend_memory_contexts.total_bytes,', 'pg_get_backend_memory_contexts.total_bytes+0,', 1)),
        ('SQL comment hidden clause', VIEW+' -- hidden'),
        ('literal content', plain.replace('name,', "'name',", 1)),
        ('quoted wrong case', plain.replace('name,', '"Name",', 1)),
        ('public imitation', VIEW.replace('FROM pg_catalog.', 'FROM public.', 1)),
        ('renamed builtin', VIEW.replace('FROM pg_catalog.pg_get_backend_memory_contexts()', 'FROM pg_catalog.pg_get_backend_memory_contexts_fake()', 1)),
    ]:
        rejects('view '+label, view, text)

    before = observer_state()
    after = selected_state(before)
    accepts('valid exact observer state', state, before, CLONE)
    accepts('minimal owner SELECT and EXECUTE', selected, before, after, CLONE)
    accepts('raw NULL kept when effective', selected, observer_state(True, True), observer_state(True, True), CLONE)
    accepts('exact restore', restored, before, copy.deepcopy(before), CLONE)
    accepts('bounded readback wrapper', readback, {'schema':'helmut-cas-heap-observer-acl-readback/1',
             'readbackBackendPID':31001, 'state':before}, CLONE)
    # Native PG17.6 jsonb_build_object leaves OID values as oidout strings.
    # Every OID source kind must reject an integer rather than normalize it.
    oid_paths = [
        ('binding', 'databaseOID'), ('role', 'oid'),
        *[('memberships', 0, key) for key in ('oid', 'roleid', 'member', 'grantor')],
        *[('objects', obj, key) for obj in ('view', 'function')
          for key in ('oid', 'schemaOID', 'schemaOwnerOID', 'ownerOID')],
        ('objects', 'view', 'columns', 0, 'typeOID'),
        ('objects', 'function', 'languageOID'), ('objects', 'function', 'returnType'),
        *[('objects', obj, 'aclExpanded', 0, key) for obj in ('view', 'function')
          for key in ('grantor', 'grantee')],
    ]
    def replace_path(value, path, replacement):
        owner = value
        for part in path[:-1]:
            owner = owner[part]
        owner[path[-1]] = replacement
    for path in oid_paths:
        changed = copy.deepcopy(before)
        owner = changed
        for part in path:
            owner = owner[part]
        replace_path(changed, path, int(owner))
        rejects('native OID rejects JSON integer '+str(path), state, changed, CLONE)
    for invalid in ['020001', '+20001', ' 20001', '20001.0', '4294967296', '0', '-1', '²', 20001.0]:
        changed = copy.deepcopy(before)
        changed['role']['oid'] = invalid
        rejects('canonical positive OID string '+repr(invalid), state, changed, CLONE)
    public_state = observer_state(True)
    for obj, privilege, letter in [('view', 'SELECT', 'r'), ('function', 'EXECUTE', 'X')]:
        public_state['objects'][obj]['rawACL'] = public_state['objects'][obj]['rawACL'][:-1]+',='+letter+'/postgres}'
        public_state['objects'][obj]['aclExpanded'].append(
            {'ordinal': 3, 'grantor': '10', 'grantee': '0', 'privilege': privilege, 'grantable': False})
    accepts('native PUBLIC grantee OID zero is valid', state, public_state, CLONE)
    for path, scalar in [
        (('role', 'connectionLimit'), '-1'),
        (('objects', 'view', 'columns', 0, 'number'), '1'),
        (('objects', 'view', 'columns', 0, 'typeModifier'), '-1'),
        (('objects', 'function', 'argumentCount'), '0'),
        (('objects', 'view', 'aclExpanded', 0, 'ordinal'), '1'),
    ]:
        changed = copy.deepcopy(before)
        replace_path(changed, path, scalar)
        rejects('native integer is not OID string '+str(path), state, changed, CLONE)
    missing_null = observer_state(False, True)
    rejects('missing+NULL before grant', state, missing_null, CLONE)
    for label, alter in [
        ('builtin function OID', lambda x: x['objects']['function'].__setitem__('oid', '2283')),
        ('both baseline schema OIDs', lambda x: [x['objects'][k].__setitem__('schemaOID', '12') for k in ('view','function')]),
        ('function output modes', lambda x: x['objects']['function'].__setitem__('argumentModes', '{i}')),
        ('function output types', lambda x: x['objects']['function'].__setitem__('allArgumentTypes', '{25}')),
        ('view ABI names', lambda x: x['objects']['view']['columns'][0].__setitem__('name', 'secret')),
        ('view definition hash', lambda x: x['objects']['view'].__setitem__('definitionSHA256', 'f'*64)),
        ('builtin source mismatch', lambda x: x['objects']['function'].__setitem__('source', 'other_function')),
        ('bool role OID', lambda x: x['role'].__setitem__('oid', True)),
        ('role inherits membership scalar type', lambda x: x['memberships'][0].__setitem__('inheritOption', 1)),
        ('extra observer object', lambda x: x['objects'].__setitem__('auth_table', {})),
    ]:
        changed = copy.deepcopy(before)
        alter(changed)
        rejects(label, state, changed, CLONE)
    for label, alter in [
        ('grant option', lambda x: x['objects']['view']['aclExpanded'][-1].__setitem__('grantable', True)),
        ('extra privilege', lambda x: x['objects']['view']['aclExpanded'].append({'ordinal':4,'grantor':'10','grantee':'20001','privilege':'UPDATE','grantable':False})),
        ('membership changed', lambda x: x['memberships'][0].__setitem__('setOption', False)),
        ('owner changed', lambda x: x['objects']['view'].__setitem__('ownerOID', '11')),
        ('both namespace OIDs drift', lambda x: [x['objects'][k].__setitem__('schemaOID', '12') for k in ('view','function')]),
    ]:
        changed = copy.deepcopy(after)
        alter(changed)
        rejects('selected '+label, selected, before, changed, CLONE)
    for label, alter in [
        ('raw ACL ordering', lambda x: x['objects']['view'].__setitem__('rawACL', '{pg_read_all_stats=r/postgres,postgres=r/postgres}')),
        ('raw NULL identity', lambda x: x['objects']['view'].__setitem__('rawACL', None)),
        ('grantor identity', lambda x: x['objects']['view']['aclExpanded'][0].__setitem__('grantor', '999')),
        ('effective right left behind', lambda x: x['objects']['function'].__setitem__('effective', True)),
    ]:
        changed = copy.deepcopy(before)
        alter(changed)
        rejects('restore '+label, restored, before, changed, CLONE)
    null_before = observer_state(True, True)
    null_changed = copy.deepcopy(null_before)
    null_changed['objects']['view']['rawACL'] = '{}'
    rejects('restore preserves already-effective NULL literal', restored, null_before, null_changed, CLONE)
    forged = copy.deepcopy(before)
    forged['objects']['view']['definition'] = plain[:-1]+' WHERE true;'
    forged['objects']['view']['definitionSHA256'] = hashlib.sha256(forged['objects']['view']['definition'].encode()).hexdigest()
    rejects('malicious full view with matching hash', state, forged, CLONE)
    header = {'schema':'helmut-cas-heap-metadata-namespace/1','searchPath':'pg_catalog','qualified':1,'backendPID':31001}
    accepts('same-session pinned namespace', namespace, header, 31001)
    changed = copy.deepcopy(header);changed['searchPath'] = 'public, pg_catalog'
    rejects('namespace search path shadowing', namespace, changed, 31001)
    rejects('namespace readback PID mismatch', namespace, header, 31002)
    changed = copy.deepcopy(header);changed['qualified'] = True
    rejects('namespace typed integer qualification', namespace, changed, 31001)
    changed = copy.deepcopy(header);changed['backendPID'] = True
    rejects('namespace PID boolean forbidden', namespace, changed, 31001)
    return checks


def main():
    if len(sys.argv) != 2:
        raise RuntimeError('exactly one frozen worker source path required')
    namespace = load_pure(Path(sys.argv[1]))
    checks = run_guards(namespace)
    print(json.dumps({'pass': True, 'checks': checks}, separators=(',', ':')))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'pass': False, 'error': type(error).__name__, 'message': str(error)}, separators=(',', ':')))
        raise SystemExit(1)
