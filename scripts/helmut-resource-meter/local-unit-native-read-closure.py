"""Install the reviewed read closure in a NEW source-local diagnostic copy.

The caller supplies query(database, sql, label): a fresh initial-postgres session,
ON_ERROR_STOP, bounded private captures, and disconnect/rollback on every error.
It must independently identify the owned copy/container/cgroup and supply the
genuine SourceVerifier command. This module has no connection or CLI defaults,
starts nothing, installs no authority/claim, and never returns SQL or passwords.
Controller copies qualificationFiles[].text EXACTLY to the root-only pin.path
with mode0600; these documents contain source/catalog metadata only.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import stat


class ReadClosureError(RuntimeError):
    pass


PARTS = 'supabase/proposals/auth_state_parts_local.sql'
USAGE = 'supabase/proposals/auth_usage_atomic_local.sql'
BOUNDED = 'supabase/proposals/auth_read_bounded_local.sql'
# name suffix, type-only arguments, actual original prosrc SHA, volatility, source
FUNCTIONS = (
    ('state_graph_read', 'jsonb', '4e2b9015790312d0b05e781ba6ef9a62cb13462167c47b6c9a998f27cdfb9ae0', 's', BOUNDED),
    ('usage_read', 'jsonb', 'c7395fad4c68780261e00f05aaabe4e78128148f1cbbbbe745eec96309d27a94', 's', USAGE),
    ('state_assert_root_local', 'jsonb', '5748e17648b694151aaf72cdc7097e02b5d9e16b431a41f385f7a081ed925d82', 'i', PARTS),
    ('usage_checked_proof_local', 'text', '53400d66f398dcc30c44ea2ee4e48cfc52c6d065637dda886734e45887c6b936', 's', BOUNDED),
    ('state_graph_checked_local', 'text, text, text, boolean', '400db1de85d39b4141444250a356984bfafe068014b6ccfd8949f74a071bd9ec', 's', BOUNDED),
    ('state_expand_local', 'text, text, text, boolean, boolean', 'd02ac4844aaa10dd41c601a1e568398adf375f18810c6301bdab6040d11a1e32', 's', PARTS),
)
QUALIFIER_SHA = 'c52be16a8c292dda33954dd2be29f34021c94b86a638f4dfe872d0d91bc50aa5'
TABLES = ('profiles', 'mandate_profiles', 'raw_documents', 'knowledge_objects',
          'helmut_store', 'helmut_auth_state_nodes_local', 'llm_usage')
OWN_TABLES = ('authority', 'runtime_observations', 'state', 'artifacts', 'leases')
_attempted = set()
COLUMNS = tuple((t, c, ty) for t, cs in (
    ('profiles', (('id', 'text'),)), ('mandate_profiles', (('user_id', 'text'),)),
    ('raw_documents', (('id', 'text'),)), ('knowledge_objects', (('id', 'text'),)),
    ('helmut_store', (('id', 'text'), ('data', 'jsonb'))),
    ('helmut_auth_state_nodes_local', (('store_id', 'text'), ('generation', 'text'))),
    ('llm_usage', (('usage_store_id', 'text'), ('usage_generation', 'text')))) for c, ty in cs)


def _need(ok, code):
    if not ok:
        raise ReadClosureError('native-read-closure-' + code)


def _sha(value):
    return hashlib.sha256(value.encode('utf8') if isinstance(value, str) else value).hexdigest()


def _q(value):
    _need(type(value) is str and '\0' not in value, 'sql-text')
    return "'" + value.replace("'", "''") + "'"


def _json(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True, allow_nan=False)


def _parse(value):
    def unique(pairs):
        result = {}
        for key, item in pairs:
            if key in result:
                raise ValueError('duplicate')
            result[key] = item
        return result
    return json.loads(value, object_pairs_hook=unique,
                      parse_constant=lambda _: (_ for _ in ()).throw(ValueError('constant')))


def _identity(s):
    return tuple(getattr(s, k) for k in ('st_dev', 'st_ino', 'st_uid', 'st_gid', 'st_mode',
                                        'st_nlink', 'st_size', 'st_mtime_ns', 'st_ctime_ns'))


def _source(pin, relative):
    _need(type(pin) is dict and set(pin) == {'path', 'bytes', 'sha256'}
          and type(pin['path']) is str and pin['path'].endswith('/' + relative)
          and type(pin['bytes']) is int and 0 < pin['bytes'] <= 8 * 1024**2
          and type(pin['sha256']) is str and re.fullmatch('[a-f0-9]{64}', pin['sha256']), 'source-pin')
    p = Path(pin['path'])
    _need(p.is_absolute() and str(p) == pin['path'] and p.resolve() == p, 'source-path')
    fd = os.open(p, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(fd)
        _need(stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and before.st_size == pin['bytes'], 'source-file')
        blocks, total = [], 0
        while block := os.read(fd, 65536):
            total += len(block)
            _need(total <= pin['bytes'], 'source-growth')
            blocks.append(block)
        raw = b''.join(blocks)
        _need(total == pin['bytes'] and _sha(raw) == pin['sha256']
              and _identity(before) == _identity(os.fstat(fd)) == _identity(p.lstat()), 'source-drift')
        return raw.decode('utf8', errors='strict')
    finally:
        os.close(fd)


def _inputs(database, operation, text, digest, pins, password):
    _need(os.getuid() == os.geteuid() == os.getgid() == os.getegid() == 1000
          and not os.environ.get('VERCEL'), 'source-local-uid')
    _need(type(operation) is str and re.fullmatch('localUnitDiagnostic-[a-f0-9]{32}', operation)
          and database == 'helmut_unit_diagnostic_' + operation[-32:], 'owned-database')
    _need(type(text) is str and 2 <= len(text.encode('utf8', errors='strict')) <= 16 * 1024**2
          and type(digest) is str and re.fullmatch('[a-f0-9]{64}', digest) and _sha(text) == digest, 'command-bytes')
    c = _parse(text)
    _need(type(c) is dict and set(c) == {'version', 'mode', 'source', 'calendar', 'target', 'gatePins', 'requestPins', 'drafts', 'units', 'slot', 'limits'}
          and c['version'] == 'helmut-local-unit-diagnostic-command/1' and c['mode'] == 'D-R-1-local-fixture'
          and c['target']['database'] == database and c['slot']['plan']['operationId'] == operation
          and type(c['limits']['units']) is int and c['limits']['units'] == 1 and c['limits']['production'] is False and c['limits']['paidProviderCallsAllowed'] is False
          and type(c['source']['sourceIndex']) is int and c['source']['sourceIndex'] == 499
          and type(c['source']['diagnosticUnit']) is int and c['source']['diagnosticUnit'] == 0
          and len(c['units']) == len(c['drafts']) == 1 and c['units'][0]['kind'] == 'DR', 'command-scope')
    subject = c['units'][0]['subject']
    _need(type(subject) is str and 0 < len(subject.encode('utf8')) <= 256 and '\0' not in subject
          and c['drafts'][0]['profile']['id'] == subject, 'subject')
    sources = c['drafts'][0]['sources']
    _need(type(sources) is dict and set(sources) == {'documents', 'knowledgeObjects'}, 'source-selection')
    ids = {}
    for key in ('documents', 'knowledgeObjects'):
        _need(type(sources[key]) is list and len(sources[key]) <= 4000, 'source-selection')
        values = [row['id'] for row in sources[key]]
        _need(all(type(v) is str and 0 < len(v.encode('utf8')) <= 200 and '\0' not in v for v in values)
              and len(set(values)) == len(values), 'source-identifiers')
        ids[key] = sorted(values)
    _need(type(password) is str and re.fullmatch('[a-f0-9]{64}', password) and len(set(password)) > 1, 'private-authenticator-input')
    _need(type(pins) is dict and set(pins) == {PARTS, USAGE, BOUNDED}, 'complete-source-pins')
    texts = {relative: _source(pins[relative], relative) for relative in sorted(pins)}
    for suffix, _, body_hash, _, relative in FUNCTIONS:
        name = 'helmut_auth_' + suffix + '_v1'
        matches = list(re.finditer(r'create\s+(?:or\s+replace\s+)?function\s+public\.' + name
                                  + r'\(.*?\bas\s+(\$[^$]*\$)(.*?)\1', texts[relative], re.S | re.I))
        _need(len(matches) == 1 and _sha(matches[0][2]) == body_hash, 'reviewed-original-source')
    return subject, ids


def _call(query, database, sql, label):
    try:
        raw = query(database, sql, label)
        if type(raw) is bytes:
            _need(len(raw) <= 65536, 'output-cap')
            raw = raw.decode('utf8', errors='strict')
        if type(raw) is str:
            _need(len(raw.encode('utf8', errors='strict')) <= 65536, 'output-cap')
            raw = _parse(raw)
        _need(type(raw) is dict and len(_json(raw)) <= 65536, 'output-object')
        return _parse(_json(raw))  # Snapshot callback dictionaries before later calls.
    except Exception:
        raise ReadClosureError('native-read-closure-query-' + label) from None


def _values(rows):
    return ','.join('(' + ','.join(_q(v) for v in row) + ')' for row in rows)


def _expected():
    return [('helmut_auth_' + name + '_v1', args, sha, vol) for name, args, sha, vol, _ in FUNCTIONS]


def _guard(database, operation, text, digest, installed=False, auth_hash=None):
    suffix = operation[-32:]
    owner, runtime, auth = ('helmut_ud_' + k + '_' + suffix for k in ('owner', 'runtime', 'authenticator'))
    sql = """DO $guard$
DECLARE p record; e record; cmd jsonb; command_text constant text:=COMMAND_TEXT;
BEGIN
IF current_database()<>DB OR current_setting('server_version_num')::integer NOT BETWEEN 170000 AND 179999
 OR current_setting('server_encoding')<>'UTF8' OR current_setting('client_encoding')<>'UTF8'
 OR current_user<>session_user OR session_user<>'postgres'
 OR NOT EXISTS(SELECT FROM pg_roles WHERE rolname=current_user AND rolsuper)
 OR COMMAND_HASH<>encode(sha256(convert_to(command_text,'UTF8')),'hex')
 OR NOT(command_text IS JSON OBJECT WITH UNIQUE KEYS) THEN RAISE EXCEPTION 'read-closure-source-owned-context';END IF;
cmd:=command_text::jsonb;
IF cmd#>>'{slot,plan,operationId}' IS DISTINCT FROM OPERATION OR cmd#>>'{target,database}' IS DISTINCT FROM DB
 OR cmd->>'mode' IS DISTINCT FROM 'D-R-1-local-fixture' OR cmd#>'{limits,production}' IS DISTINCT FROM 'false'::jsonb
 OR cmd#>'{limits,paidProviderCallsAllowed}' IS DISTINCT FROM 'false'::jsonb THEN RAISE EXCEPTION 'read-closure-command-scope';END IF;
IF (SELECT count(*) FROM pg_roles WHERE rolname IN(OWNER,RUNTIME) AND NOT(rolsuper OR rolcreaterole OR rolcreatedb OR rolcanlogin OR rolinherit OR rolreplication OR rolbypassrls))<>2
 OR EXISTS(SELECT FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=RUNTIME))
 OR NOT EXISTS(SELECT FROM pg_namespace WHERE nspname='helmut_unit_diagnostic' AND nspowner=(SELECT oid FROM pg_roles WHERE rolname=OWNER))
 THEN RAISE EXCEPTION 'read-closure-owned-roles';END IF;
IF (SELECT count(*) FROM pg_class WHERE oid IN(TABLE_NAMES) AND relkind='r' AND NOT relispartition)<>7
 OR EXISTS(SELECT FROM pg_inherits WHERE inhrelid IN(TABLE_NAMES) OR inhparent IN(TABLE_NAMES))
 THEN RAISE EXCEPTION 'read-closure-seven-real-tables';END IF;
FOR e IN SELECT * FROM (VALUES COLUMNS) x(tab,col,typ) LOOP
 IF NOT EXISTS(SELECT FROM pg_attribute WHERE attrelid=('public.'||e.tab)::regclass AND attname=e.col AND attnum>0 AND NOT attisdropped AND atttypid=('pg_catalog.'||e.typ)::regtype AND atttypmod=-1)
 THEN RAISE EXCEPTION 'read-closure-original-column-type';END IF;
END LOOP;
FOR e IN SELECT * FROM (VALUES EXPECTED) x(nam,args,sha,vol) LOOP
 SELECT p0.*,l.lanname INTO STRICT p FROM pg_proc p0 JOIN pg_language l ON l.oid=p0.prolang
 WHERE p0.pronamespace='public'::regnamespace AND p0.proname=e.nam;
 IF oidvectortypes(p.proargtypes)<>e.args OR encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')<>e.sha
  OR p.prosecdef OR p.provolatile::text<>e.vol OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog']::text[]
  OR p.prokind<>'f' OR p.prorettype<>'jsonb'::regtype OR p.lanname<>'plpgsql'
 THEN RAISE EXCEPTION 'read-closure-actual-original-code';END IF;
END LOOP;
SELECT * INTO STRICT p FROM pg_proc WHERE oid='helmut_unit_diagnostic.qualified_read_insert()'::regprocedure;
IF encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')<>QUALIFIER_SHA OR p.prosecdef
 OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog']::text[]
 OR p.prokind<>'f' OR p.prorettype<>'trigger'::regtype OR p.provolatile<>'v'
 OR p.prolang<>(SELECT oid FROM pg_language WHERE lanname='plpgsql')
 OR p.proowner<>(SELECT oid FROM pg_roles WHERE rolname=OWNER)
 OR NOT EXISTS(SELECT FROM pg_class WHERE oid='helmut_unit_diagnostic.legacy_read_rpcs'::regclass AND relkind='r' AND relrowsecurity AND relowner=p.proowner)
 OR NOT EXISTS(SELECT FROM pg_trigger WHERE tgrelid='helmut_unit_diagnostic.legacy_read_rpcs'::regclass AND tgname='qualified_read_source' AND tgfoid=p.oid AND tgenabled='A' AND tgtype=7 AND tgnargs=0 AND tgqual IS NULL AND NOT tgisinternal)
 THEN RAISE EXCEPTION 'read-closure-native-source-insert-guard';END IF;
IF (SELECT count(*) FROM public.helmut_store WHERE id='main-auth')<>1
 OR NOT EXISTS(SELECT FROM public.helmut_store WHERE id='main-auth' AND data#>>'{_authStateRef,version}'='merkle-auth-v1' AND data#>>'{_llmUsageRef,version}'='relational-atomic-v1')
 THEN RAISE EXCEPTION 'read-closure-original-auth-required';END IF;
AUTH_HASH_GUARD
INSTALL_STATE_GUARD
END;$guard$;
"""
    replacements = {'DB': _q(database), 'COMMAND_HASH': _q(digest), 'COMMAND_TEXT': _q(text), 'OPERATION': _q(operation),
                    'OWNER': _q(owner), 'RUNTIME': _q(runtime), 'QUALIFIER_SHA': _q(QUALIFIER_SHA),
                    'TABLE_NAMES': ','.join(_q('public.' + t) + '::regclass' for t in TABLES),
                    'COLUMNS': _values(COLUMNS), 'EXPECTED': _values(_expected())}
    replacements['AUTH_HASH_GUARD'] = ("IF (SELECT encode(sha256(convert_to(data::text,'UTF8')),'hex') FROM public.helmut_store WHERE id='main-auth') IS DISTINCT FROM " + _q(auth_hash) + " THEN RAISE EXCEPTION 'read-closure-original-auth-drift';END IF;") if auth_hash else ''
    if not installed:
        replacements['INSTALL_STATE_GUARD'] = ("IF EXISTS(SELECT FROM pg_roles WHERE rolname=" + _q(auth) + ") OR EXISTS(SELECT FROM helmut_unit_diagnostic.legacy_read_rpcs) OR "
            + ' OR '.join('EXISTS(SELECT FROM helmut_unit_diagnostic.' + t + ')' for t in OWN_TABLES)
            + " THEN RAISE EXCEPTION 'read-closure-new-preauthority-only';END IF;")
    else:
        replacements['INSTALL_STATE_GUARD'] = ('IF ' + ' OR '.join('EXISTS(SELECT FROM helmut_unit_diagnostic.' + t + ')' for t in OWN_TABLES)
                                             + " THEN RAISE EXCEPTION 'read-closure-preauthority-store-changed';END IF;")
    # Substitute template TOKENS only once: caller JSON must never be reparsed as
    # a template, even if a document/title contains one of these token words.
    return re.sub(r'\b(' + '|'.join(sorted(replacements, key=len, reverse=True)) + r')\b', lambda m: replacements[m[0]], sql)


def _catalog(database, operation, digest):
    names = ','.join(_q(x[0]) for x in _expected())
    return """SELECT jsonb_build_object('schema','helmut-native-read-closure-catalog/1','database',current_database(),
'databaseOID',(SELECT oid::text FROM pg_database WHERE datname=current_database()),'operationId',OP,'commandHash',HASH,
'authHash',(SELECT encode(sha256(convert_to(data::text,'UTF8')),'hex') FROM public.helmut_store WHERE id='main-auth'),
'securityHash',encode(sha256(convert_to(jsonb_build_object(
 'tables',(SELECT jsonb_agg(jsonb_build_object('oid',c.oid,'owner',c.relowner,'acl',c.relacl,'rls',c.relrowsecurity,'force',c.relforcerowsecurity) ORDER BY c.oid) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN('r','p','v','m','f','S')),
 'columns',(SELECT jsonb_agg(jsonb_build_array(a.attrelid,a.attnum,a.attacl) ORDER BY a.attrelid,a.attnum) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND a.attnum>0 AND a.attacl IS NOT NULL),
 'policies',(SELECT jsonb_agg(jsonb_build_object('relation',p.polrelid,'name',p.polname,'cmd',p.polcmd,'roles',p.polroles,'permissive',p.polpermissive,'qual',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polrelid,p.polname) FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'),
 'registry',(SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY function_name),'[]'::jsonb) FROM helmut_unit_diagnostic.legacy_read_rpcs q),
 'functions',(SELECT jsonb_agg(jsonb_build_array(p.oid,p.proowner,p.proacl) ORDER BY p.oid) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace),
 'roles',(SELECT jsonb_agg(jsonb_build_object('oid',r.oid,'name',r.rolname,'super',r.rolsuper,'bypass',r.rolbypassrls,'createDB',r.rolcreatedb,'createRole',r.rolcreaterole,'inherit',r.rolinherit,'login',r.rolcanlogin,'replication',r.rolreplication) ORDER BY r.oid) FROM pg_roles r WHERE r.rolname IN(ROLE_NAMES)),
 'memberships',(SELECT jsonb_agg(to_jsonb(m) ORDER BY m.roleid,m.member) FROM pg_auth_members m WHERE m.member IN(SELECT oid FROM pg_roles WHERE rolname IN(ROLE_NAMES))),
 'databaseACL',(SELECT datacl FROM pg_database WHERE datname=current_database()))::text,'UTF8')),'hex'),
'functions',(SELECT jsonb_agg(jsonb_build_object('oid',p.oid::text,'name',p.proname,'identityArguments',oidvectortypes(p.proargtypes),
 'prosrcSHA256',encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'),'volatility',p.provolatile::text,'returnType',format_type(p.prorettype,null),
 'language',l.lanname,'config',p.proconfig,'securityDefiner',p.prosecdef) ORDER BY p.proname)
 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.pronamespace='public'::regnamespace AND p.proname IN(NAMES)));
""".replace('OP,', _q(operation) + ',').replace('HASH,', _q(digest) + ',').replace('IN(NAMES)', 'IN(' + names + ')').replace('ROLE_NAMES', ','.join(_q('helmut_ud_' + role + '_' + operation[-32:]) for role in ('runtime', 'authenticator')))


def _validate_catalog(c, database, operation, digest):
    _need(set(c) == {'schema', 'database', 'databaseOID', 'operationId', 'commandHash', 'authHash', 'securityHash', 'functions'}
          and c['schema'] == 'helmut-native-read-closure-catalog/1' and c['database'] == database
          and c['operationId'] == operation and c['commandHash'] == digest
          and type(c['databaseOID']) is str and re.fullmatch('[1-9][0-9]{0,9}', c['databaseOID'])
          and type(c['authHash']) is str and re.fullmatch('[a-f0-9]{64}', c['authHash'])
          and type(c['securityHash']) is str and re.fullmatch('[a-f0-9]{64}', c['securityHash'])
          and type(c['functions']) is list and len(c['functions']) == 6, 'actual-catalog-shape')
    expected = {name: (args, sha, vol) for name, args, sha, vol in _expected()}
    seen, oids = set(), set()
    for f in c['functions']:
        _need(type(f) is dict and set(f) == {'oid', 'name', 'identityArguments', 'prosrcSHA256', 'volatility', 'returnType', 'language', 'config', 'securityDefiner'}
              and f['name'] in expected and f['name'] not in seen and type(f['oid']) is str
              and re.fullmatch('[1-9][0-9]{0,9}', f['oid']) and int(f['oid']) <= 4294967295 and f['oid'] not in oids, 'actual-function-pin')
        args, sha, vol = expected[f['name']]
        _need(f['identityArguments'] == args and f['prosrcSHA256'] == sha and f['volatility'] == vol
              and f['returnType'] == 'jsonb' and f['language'] == 'plpgsql' and f['config'] == ['search_path=pg_catalog']
              and f['securityDefiner'] is False, 'actual-function-source')
        seen.add(f['name']); oids.add(f['oid'])


def _documents(catalog):
    result = []
    for f in catalog['functions']:
        value = {'schema': 'helmut-local-unit-diagnostic-read-rpc-qualification/1', 'database': catalog['database'],
                 **{k: f[k] for k in ('name', 'oid', 'identityArguments', 'prosrcSHA256')}, 'readOnly': True, 'sourceReviewAccepted': True}
        text = _json(value) + '\n'
        result.append({'pin': {'path': '/run/bootstrap/READ_' + f['name'].upper() + '.PRIVATE.json',
                               'bytes': len(text.encode('utf8')), 'sha256': _sha(text)}, 'text': text})
    return result


def _predicates(subject, ids):
    def chosen(column, values):
        return column + '=ANY(ARRAY[' + ','.join(_q(v) for v in values) + ']::text[])'
    return {'profiles': 'id=' + _q(subject), 'mandate_profiles': 'user_id=' + _q(subject),
            'raw_documents': chosen('id', ids['documents']), 'knowledge_objects': chosen('id', ids['knowledgeObjects']),
            'helmut_store': "id='main-auth'",
            'helmut_auth_state_nodes_local': "store_id='main-auth' AND generation=(SELECT data#>>'{_authStateRef,generation}' FROM public.helmut_store WHERE id='main-auth')",
            'llm_usage': "usage_store_id='main-auth' AND usage_generation=(SELECT data#>>'{_llmUsageRef,generation}' FROM public.helmut_store WHERE id='main-auth')"}


def _acl_guard(operation, functions, docs, predicates):
    suffix = operation[-32:]
    runtime, auth = 'helmut_ud_runtime_' + suffix, 'helmut_ud_authenticator_' + suffix
    allowed_oids = ','.join(f['oid'] + '::oid' for f in functions)
    names = ','.join(_q('public.' + t) + '::regclass' for t in TABLES)
    expected = []
    for f, doc in zip(functions, docs):
        expected.append({'function_name': f['name'], 'http_exposed': f['name'] in ('helmut_auth_state_graph_read_v1', 'helmut_auth_usage_read_v1'),
                         'function_oid': int(f['oid']), 'identity_arguments': f['identityArguments'], 'prosrc_sha256': f['prosrcSHA256'],
                         'qualification_pin': doc['pin']})
    sql = "DO $acl$ BEGIN\n"
    sql += ("IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname=" + _q(auth) + " AND rolcanlogin AND NOT(rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolreplication OR rolbypassrls))"
            + " OR NOT has_database_privilege(" + _q(auth) + ",current_database(),'CONNECT')"
            + " OR NOT EXISTS(SELECT FROM pg_authid WHERE rolname=" + _q(auth) + " AND rolpassword LIKE 'SCRAM-SHA-256$%')"
            + " OR (SELECT count(*) FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=" + _q(auth) + "))<>1"
            + " OR NOT EXISTS(SELECT FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=" + _q(auth) + ") AND roleid=(SELECT oid FROM pg_roles WHERE rolname=" + _q(runtime) + ") AND NOT admin_option AND NOT inherit_option AND set_option)"
            + " OR EXISTS(SELECT FROM pg_roles WHERE rolname NOT IN(" + _q(auth) + "," + _q(runtime) + ") AND pg_has_role(" + _q(auth) + ",oid,'SET'))"
            + " THEN RAISE EXCEPTION 'read-closure-authenticator-membership';END IF;\n")
    for principal in (runtime, auth):
        sql += ("IF has_database_privilege(" + _q(principal) + ",current_database(),'CREATE,TEMPORARY') OR EXISTS(SELECT FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname<>'information_schema' AND has_schema_privilege(" + _q(principal) + ",oid,'CREATE'))"
                + " OR EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname NOT IN('information_schema','helmut_unit_diagnostic') AND ((c.relkind IN('r','p','v','m','f') AND (has_table_privilege(" + _q(principal) + ",c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES,MAINTAIN') OR has_any_column_privilege(" + _q(principal) + ",c.oid,'INSERT,UPDATE,REFERENCES'))) OR (c.relkind='S' AND has_sequence_privilege(" + _q(principal) + ",c.oid,'USAGE,UPDATE'))))"
                + " THEN RAISE EXCEPTION 'read-closure-no-legacy-write-or-create';END IF;\n")
    sql += ("IF EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN('r','p','v','m','f') AND (has_table_privilege(" + _q(runtime) + ",c.oid,'SELECT') OR has_any_column_privilege(" + _q(runtime) + ",c.oid,'SELECT')) IS DISTINCT FROM (c.oid IN(" + names + ")))"
            + " OR EXISTS(SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname !~ '^local_unit_diagnostic_.*_v1$' AND has_function_privilege(" + _q(runtime) + ",p.oid,'EXECUTE') IS DISTINCT FROM (p.oid IN(" + allowed_oids + ")))"
            + " THEN RAISE EXCEPTION 'read-closure-exact-read-closure';END IF;\n")
    sql += ("IF (SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY function_name),'[]'::jsonb) FROM helmut_unit_diagnostic.legacy_read_rpcs q) IS DISTINCT FROM "
            + _q(_json(sorted(expected, key=lambda x: x['function_name']))) + "::jsonb THEN RAISE EXCEPTION 'read-closure-exact-registry';END IF;\n")
    for table in TABLES:
        sql += ("IF NOT EXISTS(SELECT FROM pg_class WHERE oid='public." + table + "'::regclass AND relrowsecurity)"
                + " OR (SELECT count(*) FROM pg_policy WHERE polrelid='public." + table + "'::regclass AND (polroles@>ARRAY[(SELECT oid FROM pg_roles WHERE rolname=" + _q(runtime) + ")] OR polroles@>ARRAY[0::oid]))<>1"
                + " OR NOT EXISTS(SELECT FROM pg_policy WHERE polrelid='public." + table + "'::regclass AND polname='local_unit_source_read' AND polcmd='r' AND polpermissive AND polroles=ARRAY[(SELECT oid FROM pg_roles WHERE rolname=" + _q(runtime) + ")] AND polqual IS NOT NULL AND polwithcheck IS NULL)"
                + " THEN RAISE EXCEPTION 'read-closure-exact-select-policy';END IF;\n")
    return sql + 'END;$acl$;\n'


def _probes(operation, subject, ids, predicates):
    suffix = operation[-32:]
    runtime, auth, owner = ('helmut_ud_' + k + '_' + suffix for k in ('runtime', 'authenticator', 'owner'))
    cases = []
    for table in TABLES:
        column = 'user_id' if table == 'mandate_profiles' else ('store_id' if table == 'helmut_auth_state_nodes_local' else ('usage_store_id' if table == 'llm_usage' else 'id'))
        cases += ['UPDATE public.' + table + ' SET ' + column + '=' + column + ' WHERE false',
                  'DELETE FROM public.' + table + ' WHERE false',
                  'INSERT INTO public.' + table + '(' + column + ') SELECT NULL::text WHERE false',
                  'TRUNCATE public.' + table]
    cases += ["PERFORM public.helmut_auth_state_cas_v1('{}'::jsonb)", "PERFORM public.helmut_auth_usage_cas_v1('{}'::jsonb)",
              'CREATE TEMP TABLE local_unit_read_forbidden(id integer)', 'CREATE TABLE public.local_unit_read_forbidden(id integer)',
              "EXECUTE 'SET LOCAL ROLE " + owner + "'", 'CREATE ROLE local_unit_read_forbidden']
    sql = 'SAVEPOINT read_closure_probes;\nSET SESSION AUTHORIZATION ' + auth + ';\nSET LOCAL ROLE ' + runtime + ';\n'
    sql += 'DO $probe$ DECLARE caught boolean; checks integer:=0; n bigint; BEGIN\nPERFORM helmut_unit_diagnostic.runtime_role();\n'
    for statement in cases:
        sql += ("caught:=false;BEGIN " + statement + ";EXCEPTION WHEN insufficient_privilege THEN caught:=true;END;"
                + "IF NOT caught THEN RAISE EXCEPTION 'read-closure-negative-probe-not-denied';END IF;checks:=checks+1;\n")
    for table in TABLES:
        sql += ('IF EXISTS(SELECT FROM public.' + table + ' WHERE (' + predicates[table] + ") IS NOT TRUE) THEN RAISE EXCEPTION 'read-closure-rls-outside-selection';END IF;checks:=checks+1;\n")
    for table, count in (('profiles', 1), ('mandate_profiles', 1), ('raw_documents', len(ids['documents'])), ('knowledge_objects', len(ids['knowledgeObjects'])), ('helmut_store', 1)):
        sql += ('IF (SELECT count(*) FROM public.' + table + ')<>' + str(count) + " THEN RAISE EXCEPTION 'read-closure-actual-selected-rows';END IF;checks:=checks+1;\n")
    sql += "PERFORM public.helmut_auth_state_graph_read_v1(jsonb_build_object('id','main-auth','knownProof',null,'readNonce',gen_random_uuid()::text,'knownGraph',null));checks:=checks+1;\n"
    sql += "PERFORM public.helmut_auth_usage_read_v1(jsonb_build_object('id','main-auth'));checks:=checks+1;\n"
    # The actual receipt path also needs the original small-subtree expander.
    sql += "PERFORM public.helmut_auth_state_expand_local_v1('main-auth',(SELECT data#>>'{_authStateRef,generation}' FROM public.helmut_store WHERE id='main-auth'),(SELECT data#>>'{_authStateRef,root}' FROM public.helmut_store WHERE id='main-auth'),true,true);checks:=checks+1;\n"
    count = len(cases) + 7 + 5 + 3
    sql += 'IF checks<>' + str(count) + " THEN RAISE EXCEPTION 'read-closure-probe-count';END IF;END;$probe$;\n"
    sql += 'RESET ROLE;RESET SESSION AUTHORIZATION;\nROLLBACK TO SAVEPOINT read_closure_probes;RELEASE SAVEPOINT read_closure_probes;\n'
    return sql, count


def install_read_closure(query, *, database, operation_id, command_canonical, command_sha256, source_pins, authenticator_password_hex):
    """One-shot preparation. On unknown/failed install, use a NEW owned copy.

    No retry, existing role/registry adoption, credential return or unit authority.
    Callback must return only after its complete SQL/COMMIT and clean child EOF.
    """
    try:
        _need(callable(query), 'query-callback')
        subject, ids = _inputs(database, operation_id, command_canonical, command_sha256, source_pins, authenticator_password_hex)
        _need(database not in _attempted, 'attempt-already-consumed')
        _attempted.add(database)  # Consume before the first callback, including unknown outcomes.
        prefix = "BEGIN;SET LOCAL standard_conforming_strings=on;SET LOCAL search_path=pg_catalog;SET LOCAL row_security=on;SET LOCAL statement_timeout='25s';SET LOCAL lock_timeout='500ms';SET LOCAL helmut.local_usage_experiment='on';\n"
        guard = _guard(database, operation_id, command_canonical, command_sha256)
        catalog_sql = _catalog(database, operation_id, command_sha256)
        before = _call(query, database, prefix + guard + catalog_sql + 'ROLLBACK;', 'READ_CLOSURE_SOURCE_CATALOG')
        _validate_catalog(before, database, operation_id, command_sha256)
        documents = _documents(before)
        functions = before['functions']
        suffix = operation_id[-32:]
        owner, runtime, auth = ('helmut_ud_' + k + '_' + suffix for k in ('owner', 'runtime', 'authenticator'))
        predicates = _predicates(subject, ids)
        install = prefix + _guard(database, operation_id, command_canonical, command_sha256, auth_hash=before['authHash'])
        install += "SET LOCAL password_encryption='scram-sha-256';CREATE ROLE " + auth + " LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD " + _q(authenticator_password_hex) + ';\n'
        install += 'GRANT ' + runtime + ' TO ' + auth + ' WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;\n'
        install += 'GRANT CONNECT ON DATABASE ' + database + ' TO ' + auth + ';\n'
        install += 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ' + auth + ';REVOKE SELECT ON ALL TABLES IN SCHEMA public FROM ' + runtime + ';\n'
        install += 'REVOKE CREATE,TEMPORARY ON DATABASE ' + database + ' FROM ' + auth + ',' + runtime + ';\n'
        for table in TABLES:
            install += 'GRANT SELECT ON public.' + table + ' TO ' + runtime + ';ALTER TABLE public.' + table + ' ENABLE ROW LEVEL SECURITY;\n'
            install += 'CREATE POLICY local_unit_source_read ON public.' + table + ' FOR SELECT TO ' + runtime + ' USING(' + predicates[table] + ');\n'
        install += 'SET LOCAL ROLE ' + owner + ';\n'
        for f, document in zip(functions, documents):
            install += ('INSERT INTO helmut_unit_diagnostic.legacy_read_rpcs(function_name,http_exposed,function_oid,identity_arguments,prosrc_sha256,qualification_pin) VALUES('
                        + ','.join((_q(f['name']), 'true' if f['name'] in ('helmut_auth_state_graph_read_v1', 'helmut_auth_usage_read_v1') else 'false', f['oid'] + '::oid', _q(f['identityArguments']), _q(f['prosrcSHA256']), _q(_json(document['pin'])) + '::jsonb')) + ');\n')
        install += 'RESET ROLE;\n'
        for f in functions:
            install += 'GRANT EXECUTE ON FUNCTION public.' + f['name'] + '(' + f['identityArguments'] + ') TO ' + runtime + ';\n'
        acl = _acl_guard(operation_id, functions, documents, predicates)
        probes, count = _probes(operation_id, subject, ids, predicates)
        end_guard = _guard(database, operation_id, command_canonical, command_sha256, installed=True, auth_hash=before['authHash'])
        # Install certificates contain only the actual re-read catalog. No stdout
        # ACK is accepted until the callback confirms complete psql exit/COMMIT.
        installed = _call(query, database, install + acl + probes + end_guard + acl + 'COMMIT;\n' + catalog_sql, 'READ_CLOSURE_INSTALL')
        _validate_catalog(installed, database, operation_id, command_sha256)
        _need({k: v for k, v in installed.items() if k != 'securityHash'} == {k: v for k, v in before.items() if k != 'securityHash'}, 'install-catalog-or-auth-drift')
        after = _call(query, database, prefix + end_guard + acl + catalog_sql + 'ROLLBACK;', 'READ_CLOSURE_FRESH_READBACK')
        _validate_catalog(after, database, operation_id, command_sha256)
        _need(after == installed, 'fresh-readback-drift')
        # Controller also pins readonly mounts. Recheck these small reviewed
        # sources before returning a document for its root bootstrap copy.
        for relative, pin in source_pins.items():
            _source(pin, relative)
        public_rpcs = []
        for f, document in zip(functions, documents):
            if f['name'] in ('helmut_auth_state_graph_read_v1', 'helmut_auth_usage_read_v1'):
                public_rpcs.append({**{k: f[k] for k in ('name', 'identityArguments', 'oid', 'prosrcSHA256')},
                                    'qualificationPin': document['pin'], 'requestKeys': ['id'] if f['name'] == 'helmut_auth_usage_read_v1' else ['id', 'knownProof', 'readNonce', 'knownGraph']})
        return {'schema': 'helmut-local-unit-native-read-closure/1', 'database': database, 'databaseOID': after['databaseOID'],
                'operationId': operation_id, 'commandHash': command_sha256, 'functions': functions,
                'sourcePins': _parse(_json(source_pins)), 'qualificationFiles': documents, 'authenticatorUsername': auth,
                'legacy': {'tables': list(TABLES[:4]), 'rpcs': public_rpcs},
                'nativeReadbackSHA256': _sha(_json(after)), 'negativeChecks': len(TABLES) * 4 + 6, 'nativeProbeChecks': count,
                'probeSQLSHA256': _sha(probes), 'probeSessionOrigin': 'initial-postgres-with-set-session-authorization'}
    except Exception:
        raise ReadClosureError('native-read-closure-install-or-qualification-failed') from None
