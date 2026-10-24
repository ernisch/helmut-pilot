"""Read-only trigger qualification for the original V12 local fixture COPY.

query(database, sql, label) must run a fresh initial-postgres connection with
ON_ERROR_STOP and bounded private captures, and return only after exit0 and both
natural EOFs. This module starts nothing, changes no SQL object, installs no
authority, and does not qualify a Production schema or a diagnostic execution.
The expected trigger set comes from four exact source files, never live rows.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import stat


class OriginalTriggerQualificationError(RuntimeError):
    pass


PARTS = 'supabase/proposals/auth_state_parts_local.sql'
USAGE = 'supabase/proposals/auth_usage_atomic_local.sql'
BOUNDED = 'supabase/proposals/auth_read_bounded_local.sql'
COMMAND = 'supabase/proposals/synthetik500_stored_command_binding.sql'
SOURCES = (PARTS, USAGE, BOUNDED, COMMAND)
TABLES = ('helmut_store', 'helmut_auth_state_nodes_local', 'llm_usage', 'briefings')
BASE_KEYS = {'oid', 'table', 'name', 'functionOID', 'enabled', 'type', 'definitionSHA256'}
ROW_KEYS = BASE_KEYS | {'tableOID', 'tableOwner', 'tableOwnerOID', 'function',
    'functionOwner', 'functionOwnerOID', 'functionIdentityArguments', 'functionReturnType',
    'functionLanguage', 'functionSourceSHA256', 'functionConfig', 'functionSecurityDefiner',
    'functionVolatility', 'functionKind', 'functionIsStrict', 'functionLeakproof',
    'attributes', 'whenSHA256', 'argumentsHex', 'argumentCount', 'constraintOID',
    'deferrable', 'initiallyDeferred', 'oldTransitionTable', 'newTransitionTable', 'parentTriggerOID'}
HASH = re.compile('[a-f0-9]{64}')
OID = re.compile('[1-9][0-9]{0,9}')


def _need(ok, code):
    if not ok:
        raise OriginalTriggerQualificationError('original-trigger-' + code)


def _sha(value):
    return hashlib.sha256(value.encode('utf8') if isinstance(value, str) else value).hexdigest()


def _json(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True, allow_nan=False)


def _parse(text):
    def unique(pairs):
        value = {}
        for key, item in pairs:
            _need(key not in value, 'duplicate-json-key')
            value[key] = item
        return value
    return json.loads(text, object_pairs_hook=unique,
                      parse_constant=lambda _: (_ for _ in ()).throw(ValueError('constant')))


def _identity(s):
    return tuple(getattr(s, key) for key in ('st_dev', 'st_ino', 'st_mode', 'st_uid',
        'st_gid', 'st_nlink', 'st_size', 'st_mtime_ns', 'st_ctime_ns'))


def _source(pin, relative):
    _need(type(pin) is dict and set(pin) == {'path', 'bytes', 'sha256'}
          and type(pin['path']) is str and pin['path'].endswith('/' + relative)
          and type(pin['bytes']) is int and 0 < pin['bytes'] <= 8 * 1024**2
          and type(pin['sha256']) is str and HASH.fullmatch(pin['sha256']), 'source-pin')
    path = Path(pin['path'])
    _need(path.is_absolute() and str(path) == pin['path'] and path.resolve() == path, 'source-path')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(fd)
        _need(stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and before.st_size == pin['bytes'], 'source-file')
        chunks, size = [], 0
        while block := os.read(fd, 65536):
            size += len(block)
            _need(size <= pin['bytes'], 'source-growth')
            chunks.append(block)
        raw = b''.join(chunks)
        _need(size == pin['bytes'] and _sha(raw) == pin['sha256']
              and _identity(before) == _identity(os.fstat(fd)) == _identity(path.lstat()), 'source-drift')
        return raw.decode('utf8', errors='strict')
    finally:
        os.close(fd)


def _ddl_statements(text):
    # Only top-level SQL is inspected. Function bodies, quoted text and comments
    # cannot manufacture a CREATE TRIGGER. Unsupported trigger grammar fails.
    out, current, pos = [], [], 0
    token = re.compile(r"--[^\n]*(?:\n|$)|/\*.*?\*/|'(?:''|[^'])*'|\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$", re.S)
    while pos < len(text):
        match = token.match(text, pos)
        if match:
            raw = match[0]
            if raw.startswith('$'):
                end = text.find(raw, match.end())
                _need(end >= 0, 'source-dollar-quote')
                pos = end + len(raw)
            else:
                pos = match.end()
            current.append(' ')
            continue
        char = text[pos]
        if char == ';':
            out.append(' '.join(''.join(current).split()))
            current = []
        else:
            current.append(char)
        pos += 1
    _need(not ''.join(current).strip(), 'source-trailing-sql')
    return out


def _functions(text):
    pattern = (r'create\s+(?:or\s+replace\s+)?function\s+public\.([a-z][a-z0-9_]*)\s*\(\s*\)'
               r'\s+returns\s+trigger\s+(.*?)\bas\s+(\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$)(.*?)\3')
    found = {}
    for match in re.finditer(pattern, text, re.I | re.S):
        name, header, _, body = match.groups()
        _need(name not in found and re.fullmatch(r'\s*language\s+plpgsql\s+security\s+invoker\s+set\s+search_path\s*=\s*pg_catalog\s*', header, re.I), 'source-trigger-function')
        found[name] = _sha(body)
    return found


def _expected(texts):
    expected, functions, counts = {}, {}, {}
    pattern = (r'create trigger ([a-z][a-z0-9_]*) before ((?:insert|update|delete|truncate)(?: or (?:insert|update|delete|truncate))*)'
               r' on public\.([a-z][a-z0-9_]*) for each (row|statement) execute function public\.([a-z][a-z0-9_]*)\(\)')
    enable_pattern = r'alter table public\.([a-z][a-z0-9_]*) enable always trigger ([a-z][a-z0-9_]*)'
    for relative in SOURCES:
        bodies = _functions(texts[relative])
        _need(not set(functions) & set(bodies), 'duplicate-source-trigger-function')
        functions.update(bodies)
        statements, enables, created = _ddl_statements(texts[relative]), set(), set()
        for statement in statements:
            if re.match(r'create\s+(?:constraint\s+)?trigger\b', statement, re.I):
                match = re.fullmatch(pattern, statement.lower())
                _need(match is not None, 'unsupported-trigger-ddl')
                name, events, table, level, function = match.groups()
                key = table + '.' + name
                event_set = set(events.split(' or '))
                _need(table in TABLES and key not in expected and len(event_set) == len(events.split(' or '))
                      and (('truncate' not in event_set and level == 'row') or event_set == {'truncate'} and level == 'statement'), 'source-trigger-shape')
                ordered = [event for event in ('insert', 'delete', 'update', 'truncate') if event in event_set]
                definition = ('CREATE TRIGGER ' + name + ' BEFORE ' + ' OR '.join(ordered).upper()
                              + ' ON public.' + table + ' FOR EACH ' + level.upper() + ' EXECUTE FUNCTION ' + function + '()')
                expected[key] = {'table': table, 'name': name, 'function': 'public.' + function,
                    'enabled': 'A', 'type': 2 + (1 if level == 'row' else 0) + sum({'insert': 4, 'delete': 8, 'update': 16, 'truncate': 32}[e] for e in event_set),
                    'definitionSHA256': _sha(definition), 'source': relative}
                created.add(key)
            elif re.match(r'alter\s+table\b.*\btrigger\b', statement, re.I):
                match = re.fullmatch(enable_pattern, statement.lower())
                _need(match is not None, 'unsupported-trigger-enable')
                key = '.'.join(match.groups())
                _need(key in created and key not in enables, 'source-enable-binding')
                enables.add(key)
            elif re.match(r'(?:drop|alter)\s+trigger\b', statement, re.I):
                _need(False, 'unsupported-trigger-change')
        _need(created == enables, 'source-trigger-always-required')
        counts[relative] = len(created)
    _need(counts == {PARTS: 4, USAGE: 4, BOUNDED: 0, COMMAND: 2} and len(expected) == 10, 'complete-source-trigger-set')
    for value in expected.values():
        name = value['function'][7:]
        _need(name in functions, 'source-trigger-body-required')
        value['functionSourceSHA256'] = functions[name]
    return expected


def _oid(value):
    return type(value) is str and OID.fullmatch(value) and int(value) <= 4294967295


def _baseline(catalog, database, expected):
    _need(type(catalog) is dict and catalog.get('database') == database and _oid(catalog.get('databaseOID'))
          and type(catalog.get('originalTriggers')) is list and len(catalog['originalTriggers']) == 10
          and type(catalog.get('originalSources')) is list, 'input-catalog')
    seen, oids, result = set(), set(), []
    for trigger in catalog['originalTriggers']:
        _need(type(trigger) is dict and set(trigger) == BASE_KEYS and _oid(trigger['oid'])
              and _oid(trigger['functionOID']) and trigger['oid'] not in oids, 'input-trigger')
        key = trigger['table'] + '.' + trigger['name']
        e = expected.get(key)
        _need(e is not None and key not in seen and type(trigger['type']) is int
              and all(trigger[k] == e[k] for k in ('table', 'name', 'enabled', 'type', 'definitionSHA256')), 'input-trigger-source-mismatch')
        funcs = [f for f in catalog['originalSources'] if f.get('oid') == trigger['functionOID']]
        _need(len(funcs) == 1 and funcs[0].get('name') == e['function']
              and funcs[0].get('prosrcSHA256') == e['functionSourceSHA256']
              and funcs[0].get('returnType') == 'trigger' and funcs[0].get('identityArguments') == ''
              and funcs[0].get('securityDefiner') is False, 'input-function-binding')
        seen.add(key); oids.add(trigger['oid']); result.append(dict(trigger))
    _need(seen == set(expected), 'input-complete-trigger-set')
    return sorted(result, key=lambda t: int(t['oid']))


def _query_sql(database):
    # Public is explicit only for pg_get_triggerdef's deterministic function-name
    # deparsing, matching the worker catalog ABI. Every invoked function below is
    # qualified pg_catalog; no application function or caller SQL is executed.
    tables = ','.join("'public." + name + "'::regclass" for name in TABLES)
    return """BEGIN READ ONLY;SET LOCAL standard_conforming_strings=on;SET LOCAL search_path=pg_catalog,public;
SET LOCAL statement_timeout='25s';SET LOCAL lock_timeout='500ms';
SELECT pg_catalog.jsonb_build_object('schema','helmut-native-original-trigger-catalog/1',
 'database',pg_catalog.current_database(),'databaseOID',(SELECT oid::text FROM pg_catalog.pg_database WHERE datname=pg_catalog.current_database()),
 'sessionUser',session_user,'currentUser',current_user,'readOnly',pg_catalog.current_setting('transaction_read_only'),
 'replicationRole',pg_catalog.current_setting('session_replication_role'),
 'tables',(SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('oid',c.oid::text,'name',c.relname,
  'owner',r.rolname,'ownerOID',c.relowner::text,'kind',c.relkind::text,'persistence',c.relpersistence::text,
  'partition',c.relispartition,'rls',c.relrowsecurity,
  'parents',ARRAY(SELECT i.inhparent::text FROM pg_catalog.pg_inherits i WHERE i.inhrelid=c.oid ORDER BY i.inhseqno)) ORDER BY c.oid)
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_roles r ON r.oid=c.relowner WHERE c.oid IN(@TABLES@)),
 'triggers',(SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
  'oid',t.oid::text,'tableOID',c.oid::text,'table',c.relname,'tableOwner',cr.rolname,'tableOwnerOID',c.relowner::text,
  'name',t.tgname,'enabled',t.tgenabled::text,'type',t.tgtype::integer,'functionOID',f.oid::text,
  'function',n.nspname||'.'||f.proname,'functionOwner',fr.rolname,'functionOwnerOID',f.proowner::text,
  'functionIdentityArguments',pg_catalog.oidvectortypes(f.proargtypes),'functionReturnType',pg_catalog.format_type(f.prorettype,null),
  'functionLanguage',l.lanname,'functionSourceSHA256',pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(f.prosrc,'UTF8')),'hex'),
  'functionConfig',pg_catalog.to_jsonb(f.proconfig),'functionSecurityDefiner',f.prosecdef,
  'functionVolatility',f.provolatile::text,'functionKind',f.prokind::text,'functionIsStrict',f.proisstrict,'functionLeakproof',f.proleakproof,
  'definitionSHA256',pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.pg_get_triggerdef(t.oid,false),'UTF8')),'hex'),
  'attributes',pg_catalog.to_jsonb(t.tgattr::smallint[]),'whenSHA256',CASE WHEN t.tgqual IS NULL THEN NULL ELSE
   pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.pg_get_expr(t.tgqual,t.tgrelid),'UTF8')),'hex') END,
  'argumentsHex',pg_catalog.encode(t.tgargs,'hex'),'argumentCount',t.tgnargs::integer,'constraintOID',t.tgconstraint::text,
  'deferrable',t.tgdeferrable,'initiallyDeferred',t.tginitdeferred,'oldTransitionTable',t.tgoldtable,
  'newTransitionTable',t.tgnewtable,'parentTriggerOID',t.tgparentid::text) ORDER BY t.oid),'[]'::jsonb)
 FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
 JOIN pg_catalog.pg_proc f ON f.oid=t.tgfoid JOIN pg_catalog.pg_namespace n ON n.oid=f.pronamespace
 JOIN pg_catalog.pg_language l ON l.oid=f.prolang JOIN pg_catalog.pg_roles cr ON cr.oid=c.relowner
 JOIN pg_catalog.pg_roles fr ON fr.oid=f.proowner
 WHERE NOT t.tgisinternal AND c.oid IN(@TABLES@)));
ROLLBACK;
""".replace('@TABLES@', tables)


def _capture(query, database, label):
    value = query(database, _query_sql(database), label)
    if type(value) is bytes:
        _need(len(value) <= 131072, 'capture-cap')
        value = value.decode('utf8', errors='strict')
    if type(value) is str:
        _need(len(value.encode('utf8')) <= 131072, 'capture-cap')
        value = _parse(value)
    _need(type(value) is dict and len(_json(value).encode('utf8')) <= 131072, 'capture-shape')
    return _parse(_json(value))


def _validate(value, database, database_oid, expected, baseline):
    _need(set(value) == {'schema', 'database', 'databaseOID', 'sessionUser', 'currentUser', 'readOnly', 'replicationRole', 'tables', 'triggers'}
          and value['schema'] == 'helmut-native-original-trigger-catalog/1' and value['database'] == database
          and value['databaseOID'] == database_oid and value['sessionUser'] == value['currentUser'] == 'postgres'
          and value['readOnly'] == 'on' and value['replicationRole'] == 'origin'
          and type(value['triggers']) is list and len(value['triggers']) == 10, 'actual-catalog')
    _need(type(value['tables']) is list and len(value['tables']) == 4, 'actual-four-tables')
    tables, table_oids, owners = {}, set(), set()
    for table in value['tables']:
        _need(type(table) is dict and set(table) == {'oid', 'name', 'owner', 'ownerOID', 'kind', 'persistence', 'partition', 'rls', 'parents'}
              and table['name'] in TABLES and table['name'] not in tables and _oid(table['oid']) and table['oid'] not in table_oids
              and table['owner'] == 'postgres' and _oid(table['ownerOID']) and table['kind'] == 'r' and table['persistence'] == 'p'
              and table['partition'] is False and table['rls'] is True and table['parents'] == [], 'actual-table-contract')
        tables[table['name']] = table; table_oids.add(table['oid']); owners.add(table['ownerOID'])
    _need(len(owners) == 1, 'actual-table-owner')
    seen, oids = set(), set()
    by_oid = {t['oid']: t for t in baseline}
    for trigger in value['triggers']:
        _need(type(trigger) is dict and set(trigger) == ROW_KEYS and _oid(trigger['oid'])
              and trigger['oid'] not in oids and all(_oid(trigger[k]) for k in ('tableOID', 'functionOID', 'tableOwnerOID', 'functionOwnerOID')), 'actual-trigger-shape')
        key = trigger['table'] + '.' + trigger['name']
        e = expected.get(key)
        _need(e is not None and key not in seen and type(trigger['type']) is int
              and {k: trigger[k] for k in BASE_KEYS} == by_oid.get(trigger['oid'])
              and all(trigger[k] == e[k] for k in ('table', 'name', 'enabled', 'type', 'function', 'definitionSHA256', 'functionSourceSHA256')), 'actual-trigger-binding')
        table = tables[trigger['table']]
        _need(trigger['tableOID'] == table['oid'] and trigger['tableOwnerOID'] == table['ownerOID']
              and trigger['tableOwner'] == trigger['functionOwner'] == 'postgres'
              and trigger['tableOwnerOID'] == trigger['functionOwnerOID']
              and trigger['functionIdentityArguments'] == '' and trigger['functionReturnType'] == 'trigger'
              and trigger['functionLanguage'] == 'plpgsql' and trigger['functionConfig'] == ['search_path=pg_catalog']
              and trigger['functionSecurityDefiner'] is False and trigger['functionVolatility'] == 'v' and trigger['functionKind'] == 'f'
              and trigger['functionIsStrict'] is False and trigger['functionLeakproof'] is False
              and trigger['attributes'] == [] and trigger['whenSHA256'] is None
              and trigger['argumentsHex'] == '' and type(trigger['argumentCount']) is int and trigger['argumentCount'] == 0
              and trigger['constraintOID'] == trigger['parentTriggerOID'] == '0'
              and trigger['deferrable'] is False and trigger['initiallyDeferred'] is False
              and trigger['oldTransitionTable'] is None and trigger['newTransitionTable'] is None, 'actual-trigger-native-contract')
        seen.add(key); oids.add(trigger['oid'])
    _need(seen == set(expected), 'actual-complete-trigger-set')


def qualify_original_triggers(query, *, database, catalog, source_pins):
    """Return metadata only after two fresh read-only catalogs and source re-pins."""
    try:
        _need(callable(query) and os.getuid() == os.geteuid() == os.getgid() == os.getegid() == 1000
              and not os.environ.get('VERCEL') and type(database) is str
              and re.fullmatch('helmut_unit_diagnostic_[a-f0-9]{32}', database), 'source-owned-copy')
        pins = _parse(_json(source_pins))
        _need(type(pins) is dict and set(pins) == set(SOURCES), 'exact-four-source-pins')
        texts = {relative: _source(pins[relative], relative) for relative in SOURCES}
        roots = {Path(pins[relative]['path']).parents[len(Path(relative).parts) - 1] for relative in SOURCES}
        _need(len(roots) == 1, 'single-source-root')
        expected = _expected(texts)
        input_catalog = _parse(_json(catalog))
        baseline = _baseline(input_catalog, database, expected)
        before = _capture(query, database, 'ORIGINAL_TRIGGER_BEFORE')
        _validate(before, database, input_catalog['databaseOID'], expected, baseline)
        for relative in SOURCES:
            _source(pins[relative], relative)
        after = _capture(query, database, 'ORIGINAL_TRIGGER_AFTER')
        _validate(after, database, input_catalog['databaseOID'], expected, baseline)
        _need(before == after, 'catalog-drift')
        for relative in SOURCES:
            _source(pins[relative], relative)
        triggers = sorted(after['triggers'], key=lambda t: int(t['oid']))
        return {'schema': 'helmut-local-unit-native-original-trigger-qualification/1', 'database': database,
                'databaseOID': after['databaseOID'], 'originalTables': after['tables'], 'originalTriggers': triggers,
                'originalTriggersSHA256': _sha(_json(triggers)), 'sourcePins': pins,
                'freshReadonlyCatalogs': 2, 'preparationOnly': True, 'executionAuthorityInstalled': False,
                'unit60Qualified': False, 'full500Qualified': False}
    except Exception:
        raise OriginalTriggerQualificationError('native-original-trigger-qualification-failed') from None
