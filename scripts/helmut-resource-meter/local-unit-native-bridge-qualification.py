"""Install/qualify the original bridge only in a fresh SOURCE-owned COPY.

query(database, sql, label) must use a fresh initial-postgres session, bounded
private captures, ON_ERROR_STOP, exit0 and both pipe EOFs before returning one
JSON object. The caller independently binds COPY/container/cgroup/mounts and the
genuine Source command. This module has no CLI/connection defaults and starts
nothing. Store DDL and read closure precede it; genuine authority/seed follow it.
An unknown callback outcome consumes this attempt: discard the COPY, never retry.
The returned qualification is compiler INPUT, not authority or a unit proof.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import stat


class BridgeQualificationError(RuntimeError):
    pass


PROPOSAL = 'supabase/proposals/local_unit_original_bridge_local.sql'
COMPILER = 'scripts/helmut-resource-meter/local-unit-original-transaction.js'
STORE = 'scripts/helmut-resource-meter/local-unit-diagnostic-store.sql'
PARTS = 'supabase/proposals/auth_state_parts_local.sql'
USAGE = 'supabase/proposals/auth_usage_atomic_local.sql'
BOUNDED = 'supabase/proposals/auth_read_bounded_local.sql'
SCHEMA = 'supabase/schema.sql'
COMMAND = 'supabase/proposals/synthetik500_stored_command_binding.sql'
ORIGINAL = (
    'helmut_auth_state_cas_v1', 'helmut_auth_state_payload_hash_local_v1',
    'helmut_auth_state_leaf_info_local_v1', 'helmut_auth_state_children_local_v1',
    'helmut_auth_state_nodes_guard_local_v1', 'helmut_auth_state_put_nodes_local_v1',
    'helmut_auth_state_expand_local_v1', 'helmut_auth_state_assert_root_local_v1',
    'helmut_auth_state_assert_data_local_v1', 'helmut_auth_state_assert_graph_local_v1',
    'helmut_auth_state_auth_guard_local_v1', 'helmut_auth_state_graph_checked_local_v1',
    'helmut_auth_usage_guard_local_v1', 'helmut_auth_usage_insert_local_v1',
    'helmut_auth_usage_checked_proof_local_v1')
HELPERS = ('top_map', 'value', 'own_projection', 'compare_delta', 'compare_seed',
           'relations', 'row', 'result', 'receipt')
RPCS = ('contract', 'authority_read', 'runtime_read', 'state_read', 'state_cas',
        'artifact_insert', 'artifact_read', 'lease_acquire', 'lease_release')
READERS = ('helmut_auth_state_graph_read_v1', 'helmut_auth_usage_read_v1',
           'helmut_auth_state_assert_root_local_v1', 'helmut_auth_usage_checked_proof_local_v1',
           'helmut_auth_state_graph_checked_local_v1', 'helmut_auth_state_expand_local_v1')
TABLES = ('briefings', 'helmut_auth_state_nodes_local', 'helmut_store', 'llm_usage', 'profiles')
SOURCE_KEYS = {'oid', 'name', 'identityArguments', 'prosrcSHA256', 'volatility', 'returnType', 'language', 'config'}
_attempted = set()


def _need(ok, code):
    if not ok:
        raise BridgeQualificationError('native-original-bridge-' + code)


def _sha(raw):
    return hashlib.sha256(raw.encode('utf8') if isinstance(raw, str) else raw).hexdigest()


def _json(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True, allow_nan=False)


def _parse(text):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError('duplicate')
            result[key] = value
        return result
    return json.loads(text, object_pairs_hook=unique,
                      parse_constant=lambda _: (_ for _ in ()).throw(ValueError('constant')))


def _q(text):
    _need(type(text) is str and '\0' not in text, 'sql-text')
    return "'" + text.replace("'", "''") + "'"


def _identity(s):
    return tuple(getattr(s, k) for k in ('st_dev', 'st_ino', 'st_mode', 'st_uid', 'st_gid',
                                        'st_nlink', 'st_size', 'st_mtime_ns', 'st_ctime_ns'))


def _file(path, expected=None):
    p = Path(path)
    _need(p.is_absolute() and str(p) == str(path) and p.resolve() == p, 'canonical-source-path')
    fd = os.open(p, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        first = os.fstat(fd)
        _need(stat.S_ISREG(first.st_mode) and first.st_nlink == 1 and 0 < first.st_size <= 8 * 1024**2, 'source-file')
        blocks, size = [], 0
        while block := os.read(fd, 65536):
            size += len(block)
            _need(size <= first.st_size, 'source-growth')
            blocks.append(block)
        raw = b''.join(blocks)
        _need(size == first.st_size and _identity(first) == _identity(os.fstat(fd)) == _identity(p.lstat()), 'source-drift')
        pin = {'path': str(p), 'bytes': size, 'sha256': _sha(raw)}
        _need(expected is None or type(expected) is dict and set(expected) == {'path', 'bytes', 'sha256'} and expected == pin, 'source-pin')
        return raw.decode('utf8', errors='strict'), pin
    finally:
        os.close(fd)


def _types(args):
    result = []
    for part in args.split(',') if args.strip() else []:
        words = re.split(r'\s+default\s+', part.strip(), flags=re.I)[0].split()
        _need(1 <= len(words) <= 2 and all(re.fullmatch(r'[a-z_][a-z0-9_.]*(?:\[\])?', w) for w in words), 'source-argument-types')
        result.append(words[-1])
    return ', '.join(result)


def _definitions(text, only_original=False):
    # Reviewed SQL files, not a general SQL parser or a caller-supplied program.
    pattern = (r'create\s+(?:or\s+replace\s+)?function\s+(public|helmut_unit_diagnostic)\.([a-z][a-z0-9_]*)'
               r'\s*\((.*?)\)\s+returns\s+([a-z_][a-z0-9_.\[\]]*)\s+(.*?)\bas\s+'
               r'(\$(?:[a-zA-Z_][a-zA-Z0-9_]*)?\$)(.*?)\6')
    found = {}
    for match in re.finditer(pattern, text, re.I | re.S):
        schema, name, args, result, header, _, body = match.groups()
        key = schema + '.' + name
        if only_original and name not in ORIGINAL + READERS and result != 'trigger':
            continue
        _need(key not in found and not re.search(r'\bsecurity\s+definer\b', header, re.I), 'source-overload-or-definer')
        language = re.search(r'\blanguage\s+(sql|plpgsql)\b', header, re.I)
        _need(language is not None, 'source-language')
        config = ['search_path=pg_catalog'] if re.search(r'\bset\s+search_path\s*=\s*pg_catalog\b', header, re.I) else None
        _need(not re.search(r'\bset\b', header, re.I) or config is not None, 'source-config')
        found[key] = {'name': key, 'identityArguments': _types(args), 'prosrcSHA256': _sha(body),
                      'volatility': 'i' if re.search(r'\bimmutable\b', header, re.I) else 's' if re.search(r'\bstable\b', header, re.I) else 'v',
                      'returnType': 'timestamp with time zone' if result == 'timestamptz' else result,
                      'language': language.group(1).lower(), 'config': config}
    return found


def _sources(proposal_pin):
    _need(type(proposal_pin) is dict and set(proposal_pin) == {'path', 'bytes', 'sha256'}
          and type(proposal_pin['path']) is str and proposal_pin['path'].endswith('/' + PROPOSAL), 'proposal-pin')
    root = Path(proposal_pin['path']).parents[2]
    texts, pins = {}, {}
    for relative in (PROPOSAL, COMPILER, STORE, PARTS, USAGE, BOUNDED, SCHEMA, COMMAND):
        texts[relative], pins[relative] = _file(root / relative, proposal_pin if relative == PROPOSAL else None)
    native = _definitions(texts[STORE])
    helpers = _definitions(texts[PROPOSAL])
    _need(set(helpers) == {'helmut_unit_diagnostic.original_bridge_' + h + '_v1' for h in HELPERS}, 'nine-proposal-helpers')
    compiler = re.findall(r'(original_bridge_[a-z_]+_v1):\s*Object\.freeze\(\{\s*args:\s*"([^"]*)",\s*sha:\s*"([a-f0-9]{64})",\s*result:\s*"([^"]*)"\s*\}\)', texts[COMPILER])
    _need(len(compiler) == 9 and len({x[0] for x in compiler}) == 9, 'nine-compiler-helpers')
    for name, args, digest, result in compiler:
        h = helpers.get('helmut_unit_diagnostic.' + name)
        _need(h is not None and h['identityArguments'] == args and h['prosrcSHA256'] == digest and h['returnType'] == result
              and h['volatility'] == 's' and h['language'] == 'plpgsql' and h['config'] == ['search_path=pg_catalog'], 'compiler-proposal-body-mismatch')
    _need(not set(native) & set(helpers), 'native-source-duplicate')
    native.update(helpers)
    _need({k for k in native if k.startswith('public.')} == {'public.local_unit_diagnostic_' + r + '_v1' for r in RPCS}, 'nine-source-rpcs')
    original = {}
    # BOUNDED intentionally supersedes selected original PARTS reader bodies.
    for relative in (PARTS, USAGE, BOUNDED, SCHEMA, COMMAND):
        for name, entry in _definitions(texts[relative], only_original=True).items():
            if name in {'public.' + n for n in ORIGINAL + READERS} or entry['returnType'] == 'trigger':
                original[name] = entry
    _need(all('public.' + name in original for name in ORIGINAL), 'original-source-closure')
    return texts[PROPOSAL], pins, original, native, helpers


def expected_bridge_sources(proposal_pin):
    """Source-only 9-body map for the PRE-command runtime manifest.

    No query, installation, authority or native execution is performed. The
    controller must freeze the matching code files and later compare the whole
    actual native contract map (base plus these helpers), not just these 9.
    """
    try:
        _, pins, _, _, helpers = _sources(proposal_pin)
        for pin in pins.values():
            _file(pin['path'], pin)
        return {h['name'] + '(' + h['identityArguments'] + ')': h['prosrcSHA256'] for h in helpers.values()}
    except Exception:
        raise BridgeQualificationError('native-original-bridge-source-expectations-failed') from None


def _source_rows(rows, expected, *, original=False):
    _need(type(rows) is list and 1 <= len(rows) <= 128, 'catalog-functions')
    out, oids, names = [], set(), set()
    for f in rows:
        _need(type(f) is dict and set(f) == SOURCE_KEYS | {'securityDefiner'} and f['securityDefiner'] is False
              and type(f['oid']) is str and re.fullmatch('[1-9][0-9]{0,9}', f['oid']) and int(f['oid']) <= 4294967295
              and f['oid'] not in oids and f['name'] not in names, 'actual-source-shape')
        e = expected.get(f['name'])
        _need(e is not None and {k: f[k] for k in SOURCE_KEYS - {'oid'}} == e
              and (original or f['config'] == ['search_path=pg_catalog']), 'actual-source-body')
        out.append({k: f[k] for k in sorted(SOURCE_KEYS)})
        oids.add(f['oid']); names.add(f['name'])
    if not original:
        _need(names == set(expected), 'complete-native-sources')
    return sorted(out, key=lambda f: int(f['oid']))


def _call(query, database, sql, label):
    try:
        raw = query(database, sql, label)
        if type(raw) is bytes:
            _need(len(raw) <= 1024**2, 'capture-limit')
            raw = raw.decode('utf8', errors='strict')
        if type(raw) is str:
            _need(len(raw.encode('utf8')) <= 1024**2, 'capture-limit')
            raw = _parse(raw)
        _need(type(raw) is dict and len(_json(raw).encode()) <= 1024**2, 'capture-object')
        return _parse(_json(raw))
    except Exception:
        raise BridgeQualificationError('native-original-bridge-callback-' + label) from None


def _guard(database, digest, *, installed):
    suffix = database[-32:]
    absent = '' if installed else "OR EXISTS(SELECT FROM pg_roles WHERE rolname=" + _q('helmut_ud_bridge_writer_' + suffix) + ") OR EXISTS(SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='helmut_unit_diagnostic' AND p.proname LIKE 'original_bridge_%')"
    return """DO $copy_guard$ DECLARE t text; has_rows boolean; BEGIN
IF current_database()<>@DB@ OR session_user<>'postgres' OR current_user<>session_user
 OR NOT EXISTS(SELECT FROM pg_roles WHERE rolname=session_user AND rolsuper)
 OR current_setting('server_version_num')::integer NOT BETWEEN 170000 AND 179999
 OR current_setting('server_encoding')<>'UTF8' OR current_setting('client_encoding')<>'UTF8'
 OR NOT EXISTS(SELECT FROM pg_namespace WHERE nspname='helmut_unit_diagnostic' AND nspowner=(SELECT oid FROM pg_roles WHERE rolname=@OWNER@))
 OR (SELECT count(*) FROM public.helmut_store WHERE id='main-auth')<>1
 OR (SELECT count(*) FROM helmut_unit_diagnostic.legacy_read_rpcs)<>6
 OR (SELECT count(*) FROM helmut_unit_diagnostic.legacy_read_rpcs WHERE http_exposed)<>2
 OR EXISTS(SELECT FROM helmut_unit_diagnostic.legacy_read_rpcs r LEFT JOIN pg_proc p ON p.oid=r.function_oid
  WHERE p.oid IS NULL OR p.prosecdef OR p.provolatile NOT IN('i','s') OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog']::text[]
   OR p.proname<>r.function_name OR oidvectortypes(p.proargtypes)<>r.identity_arguments OR encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')<>r.prosrc_sha256)
 @ABSENT@ THEN RAISE EXCEPTION 'original-bridge-source-copy-preseed-boundary'; END IF;
FOREACH t IN ARRAY ARRAY['authority','runtime_observations','state','artifacts','leases'] LOOP
 IF EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='helmut_unit_diagnostic' AND c.relname=t AND NOT c.relrowsecurity)
 THEN RAISE EXCEPTION 'original-bridge-own-rls';END IF;
 EXECUTE format('SELECT EXISTS(SELECT FROM helmut_unit_diagnostic.%I)',t) INTO STRICT has_rows;
 IF has_rows THEN RAISE EXCEPTION 'original-bridge-no-authority-before-preparation';END IF;
END LOOP;
END;$copy_guard$;
""".replace('@DB@', _q(database)).replace('@OWNER@', _q('helmut_ud_owner_' + suffix)).replace('@ABSENT@', absent)


def _catalog_sql(database, digest, installed=False):
    names = ','.join(_q(n) for n in ORIGINAL)
    rpcs = ','.join(_q('local_unit_diagnostic_' + n + '_v1') for n in RPCS)
    relations = 'helmut_unit_diagnostic.original_bridge_relations_v1()' if installed else "'[]'::jsonb"
    contract = "current_setting('helmut.bridge_contract')::jsonb" if installed else "'null'::jsonb"
    return """WITH target_rel AS (
 SELECT unnest(ARRAY['public.helmut_store'::regclass,'public.helmut_auth_state_nodes_local'::regclass,
  'public.llm_usage'::regclass,'public.briefings'::regclass]) oid
), original_proc AS (
 SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=ANY(ARRAY[@ORIGINAL@])
 UNION SELECT t.tgfoid FROM pg_trigger t JOIN target_rel r ON r.oid=t.tgrelid WHERE NOT t.tgisinternal
), sources AS (
 SELECT p.oid,n.nspname,p.proname,jsonb_build_object('oid',p.oid::text,'name',n.nspname||'.'||p.proname,
  'identityArguments',oidvectortypes(p.proargtypes),'prosrcSHA256',encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'),
  'volatility',p.provolatile::text,'returnType',format_type(p.prorettype,null),'language',l.lanname,
  'config',to_jsonb(p.proconfig),'securityDefiner',p.prosecdef) pin
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
)
SELECT jsonb_build_object('schema','helmut-local-unit-native-bridge-catalog/1','database',current_database(),
 'databaseOID',(SELECT oid::text FROM pg_database WHERE datname=current_database()),'commandHash',@HASH@,
 'originalSources',(SELECT jsonb_agg(pin ORDER BY oid) FROM sources WHERE oid IN(SELECT oid FROM original_proc)),
 'nativeSources',(SELECT jsonb_agg(pin ORDER BY oid) FROM sources WHERE nspname='helmut_unit_diagnostic' OR (nspname='public' AND proname=ANY(ARRAY[@RPCS@]))),
 'triggerFunctions',(SELECT coalesce(jsonb_agg(DISTINCT tgfoid::text),'[]'::jsonb) FROM pg_trigger t JOIN target_rel r ON r.oid=t.tgrelid WHERE NOT t.tgisinternal),
 'authHash',(SELECT encode(sha256(convert_to(data::text,'UTF8')),'hex') FROM public.helmut_store WHERE id='main-auth'),
 'legacyRead',(SELECT jsonb_agg(s.pin||jsonb_build_object('http',r.http_exposed) ORDER BY r.function_name)
  FROM helmut_unit_diagnostic.legacy_read_rpcs r JOIN sources s ON s.oid=r.function_oid),
 'originalRelations',@RELATIONS@,'contract',@CONTRACT@,
 'negativeChecks',@CHECKS@);
""".replace('@ORIGINAL@', names).replace('@RPCS@', rpcs).replace('@HASH@', _q(digest)).replace('@RELATIONS@', relations).replace('@CONTRACT@', contract).replace('@CHECKS@', "current_setting('helmut.bridge_negative_checks')::integer" if installed else '0')


def _validate_catalog(c, database, digest, original, native, input_pins):
    _need(set(c) == {'schema', 'database', 'databaseOID', 'commandHash', 'originalSources', 'nativeSources', 'triggerFunctions', 'authHash', 'legacyRead', 'originalRelations', 'contract', 'negativeChecks'}
          and c['schema'] == 'helmut-local-unit-native-bridge-catalog/1' and c['database'] == database and c['commandHash'] == digest
          and type(c['databaseOID']) is str and re.fullmatch('[1-9][0-9]*', c['databaseOID'])
          and type(c['authHash']) is str and re.fullmatch('[a-f0-9]{64}', c['authHash']), 'actual-copy-catalog')
    orig = _source_rows(c['originalSources'], original, original=True)
    _need(15 <= len(orig) <= 32 and {f['name'] for f in orig} >= {'public.' + n for n in ORIGINAL}, 'actual-original-closure')
    _need(type(c['triggerFunctions']) is list and len(set(c['triggerFunctions'])) == len(c['triggerFunctions'])
          and set(c['triggerFunctions']) <= {f['oid'] for f in orig}, 'four-table-trigger-closure')
    _need(all(f['name'] in {'public.' + n for n in ORIGINAL} or f['oid'] in c['triggerFunctions'] and f['returnType'] == 'trigger' for f in orig), 'no-extra-original-rpcs')
    pins_by_oid = {p['oid']: p for p in input_pins}
    _need(all(f == {k: pins_by_oid.get(f['oid'], {}).get(k) for k in SOURCE_KEYS} for f in orig), 'original-input-pin-drift')
    natives = _source_rows(c['nativeSources'], native)
    _need(type(c['legacyRead']) is list and len(c['legacyRead']) == 6
          and all(type(r) is dict and set(r) == SOURCE_KEYS | {'securityDefiner', 'http'} and type(r['http']) is bool for r in c['legacyRead'])
          and {r['name'] for r in c['legacyRead'] if r['http']} == {'public.helmut_auth_state_graph_read_v1', 'public.helmut_auth_usage_read_v1'}, 'actual-read-closure')
    actual_reads = _source_rows([{k: v for k, v in r.items() if k != 'http'} for r in c['legacyRead']], original, original=True)
    _need({r['name'] for r in actual_reads} == {'public.' + n for n in READERS}, 'actual-six-readers')
    return orig, natives


def _security_sql(database):
    suffix = database[-32:]
    writer, runtime, auth = ('helmut_ud_' + p + '_' + suffix for p in ('bridge_writer', 'runtime', 'authenticator'))
    # Exact effective user/system columns, including grants inherited from PUBLIC. No old
    # UPDATE/INSERT privilege is granted to runtime/authenticator by this module.
    allowed = {
        'helmut_store': {'SELECT': ['id', 'data', 'xmin'], 'INSERT': ['id', 'data'], 'UPDATE': ['data']},
        'briefings': {'SELECT': ['id', 'user_id', 'slot', 'generated_at', 'payload', 'xmin'], 'INSERT': ['id', 'user_id', 'slot', 'generated_at', 'payload']},
        'helmut_auth_state_nodes_local': {'SELECT': '*', 'INSERT': ['store_id', 'generation', 'payload']},
        'llm_usage': {'SELECT': '*', 'INSERT': ['id', 'created_at', 'tenant_id', 'profile_id', 'run_id', 'pipeline_step', 'politician_id', 'user_id', 'model', 'call_type', 'prompt_tokens', 'completion_tokens', 'total_tokens', 'estimated_cost', 'duration_ms', 'success', 'error', 'usage_store_id', 'usage_generation', 'usage_ordinal', 'usage_record', 'usage_prev_hash']}}
    return """DO $bridge_acl$ DECLARE w text:=@WRITER@; r text:=@RUNTIME@; a text:=@AUTH@; t record; col record; priv text;
 allowed jsonb:=@ALLOWED@::jsonb; expected boolean;
BEGIN
IF (SELECT count(*) FROM pg_roles WHERE rolname IN(w,r) AND NOT(rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolinherit OR rolcanlogin OR rolreplication))<>2
 OR NOT EXISTS(SELECT FROM pg_roles WHERE rolname=a AND rolcanlogin AND NOT(rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolinherit OR rolreplication))
 OR EXISTS(SELECT FROM pg_auth_members WHERE member IN((SELECT oid FROM pg_roles WHERE rolname=w),(SELECT oid FROM pg_roles WHERE rolname=r)) OR roleid=(SELECT oid FROM pg_roles WHERE rolname=w))
 OR (SELECT count(*) FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=a))<>1
 OR NOT EXISTS(SELECT FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=a) AND roleid=(SELECT oid FROM pg_roles WHERE rolname=r) AND NOT admin_option AND NOT inherit_option AND set_option)
 OR EXISTS(SELECT FROM unnest(ARRAY[w,r,a]) p WHERE has_database_privilege(p,current_database(),'CREATE,TEMPORARY'))
 OR EXISTS(SELECT FROM pg_namespace n CROSS JOIN unnest(ARRAY[w,r,a]) p WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND has_schema_privilege(p,n.oid,'CREATE'))
 THEN RAISE EXCEPTION 'original-bridge-exact-role-boundary';END IF;
FOR t IN SELECT c.*,n.nspname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname !~ '^pg_' AND n.nspname NOT IN('information_schema','helmut_unit_diagnostic') AND c.relkind IN('r','p','v','m','f') LOOP
 IF has_table_privilege(w,t.oid,'DELETE,TRUNCATE,TRIGGER,REFERENCES,MAINTAIN')
  OR has_any_column_privilege(w,t.oid,'REFERENCES')
  OR has_table_privilege(r,t.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES,MAINTAIN') OR has_any_column_privilege(r,t.oid,'INSERT,UPDATE,REFERENCES')
  OR has_table_privilege(a,t.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES,MAINTAIN') OR has_any_column_privilege(a,t.oid,'SELECT,INSERT,UPDATE,REFERENCES')
 THEN RAISE EXCEPTION 'original-bridge-legacy-write-leak';END IF;
 FOR col IN SELECT attname,attnum FROM pg_attribute WHERE attrelid=t.oid AND attnum<>0 AND NOT attisdropped LOOP
  FOREACH priv IN ARRAY ARRAY['SELECT','INSERT','UPDATE'] LOOP
   expected:=t.nspname='public' AND (allowed#>ARRAY[t.relname,priv] = '"*"'::jsonb OR coalesce(allowed#>ARRAY[t.relname,priv] ? col.attname,false));
   IF has_column_privilege(w,t.oid,col.attnum,priv) IS DISTINCT FROM coalesce(expected,false)
   THEN RAISE EXCEPTION 'original-bridge-writer-columns';END IF;
  END LOOP;
 END LOOP;
END LOOP;
IF EXISTS(SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x
 WHERE n.nspname='helmut_unit_diagnostic' AND p.proname LIKE 'original_bridge_%' AND x.grantee=0 AND x.privilege_type='EXECUTE')
 OR has_function_privilege(r,'public.helmut_auth_state_cas_v1(jsonb)','EXECUTE')
 OR has_function_privilege(a,'public.helmut_auth_state_cas_v1(jsonb)','EXECUTE')
 OR has_function_privilege(r,'helmut_unit_diagnostic.original_bridge_compare_seed_v1(text,text,text,text,text,jsonb)','EXECUTE')
 THEN RAISE EXCEPTION 'original-bridge-function-boundary';END IF;
END;$bridge_acl$;
""".replace('@WRITER@', _q(writer)).replace('@RUNTIME@', _q(runtime)).replace('@AUTH@', _q(auth)).replace('@ALLOWED@', _q(_json(allowed)))


def _writer_read_probe_sql(database):
    # Execute the real artifact reader's columns, including system-column xmin,
    # under the actual NOLOGIN writer. LIMIT 0 emits/reads no auth/result rows.
    # Its own read-only transaction leaves the write-denial probes below intact.
    writer = 'helmut_ud_bridge_writer_' + database[-32:]
    sql = "BEGIN READ ONLY;SET LOCAL standard_conforming_strings=on;SET LOCAL search_path=pg_catalog;SET LOCAL row_security=on;SET LOCAL statement_timeout='25s';SET LOCAL lock_timeout='500ms';\n"
    sql += 'SET SESSION AUTHORIZATION ' + writer + ';\n'
    sql += """DO $writer_read_probe$ BEGIN
IF current_database() IS DISTINCT FROM @DB@ OR session_user IS DISTINCT FROM @WRITER@
 OR current_user IS DISTINCT FROM session_user OR current_setting('transaction_read_only')<>'on'
 OR current_setting('row_security')<>'on'
 OR NOT EXISTS(SELECT FROM pg_roles WHERE rolname=session_user AND NOT(rolsuper OR rolbypassrls OR rolcanlogin OR rolinherit OR rolcreatedb OR rolcreaterole OR rolreplication))
 OR (SELECT count(*) FROM pg_class WHERE oid IN('public.helmut_store'::regclass,'public.briefings'::regclass)
  AND relkind='r' AND relrowsecurity AND relowner<>(SELECT oid FROM pg_roles WHERE rolname=session_user))<>2
 THEN RAISE EXCEPTION 'original-bridge-writer-read-principal-or-rls';END IF;
PERFORM id,data,xmin::text FROM public.helmut_store LIMIT 0;
PERFORM id,user_id,slot,generated_at,payload,xmin::text FROM public.briefings LIMIT 0;
""".replace('@DB@', _q(database)).replace('@WRITER@', _q(writer))
    for relation, column in (('helmut_store', 'updated_at'), ('briefings', 'created_at'),
                             ('helmut_store', 'xmax'), ('briefings', 'xmax')):
        sql += 'BEGIN PERFORM ' + column + ' FROM public.' + relation + " LIMIT 0;RAISE EXCEPTION 'original-bridge-writer-read-denial-missing';EXCEPTION WHEN insufficient_privilege THEN NULL;END;\n"
    return sql + 'END;$writer_read_probe$;RESET SESSION AUTHORIZATION;ROLLBACK;\n'


def _probes_sql(database, digest):
    suffix = database[-32:]
    writer, runtime, auth, owner = ('helmut_ud_' + p + '_' + suffix for p in ('bridge_writer', 'runtime', 'authenticator', 'owner'))
    denied = ["PERFORM public.helmut_auth_state_cas_v1(NULL::jsonb)",
              "EXECUTE 'UPDATE public.helmut_store SET data=data WHERE false'",
              "EXECUTE 'DELETE FROM public.helmut_auth_state_nodes_local WHERE false'",
              "EXECUTE 'UPDATE public.llm_usage SET success=success WHERE false'",
              "EXECUTE 'INSERT INTO public.briefings(id) SELECT NULL WHERE false'",
              "EXECUTE 'CREATE TEMP TABLE bridge_runtime_forbidden(x integer)'",
              "EXECUTE 'CREATE TABLE public.bridge_runtime_forbidden(x integer)'",
              "EXECUTE 'SET ROLE " + writer + "'", "EXECUTE 'SET ROLE " + owner + "'"]
    sql = 'SET SESSION AUTHORIZATION ' + auth + '; SET ROLE ' + runtime + ';\n'
    sql += "DO $runtime_probe$ DECLARE c jsonb; caught boolean; checks integer:=0; BEGIN\n"
    sql += "PERFORM helmut_unit_diagnostic.runtime_role(); c:=public.local_unit_diagnostic_contract_v1();\n"
    sql += "PERFORM set_config('helmut.bridge_contract',c::text,true);\n"
    for statement in denied:
        sql += "BEGIN " + statement + "; RAISE EXCEPTION 'original-bridge-denial-missing'; EXCEPTION WHEN insufficient_privilege THEN checks:=checks+1;END;\n"
    # Valid input bytes, but NO fabricated graph, authority, state, claim or ACK.
    # The exact missing-root-temp-receipt error precedes every own-row access.
    sql += "caught:=false;BEGIN PERFORM helmut_unit_diagnostic.original_bridge_receipt_v1(" + ','.join((
        _q(digest), _q(digest), "'state'", _q(digest), '0', "'{}'", _q(_sha('{}')), 'NULL', 'NULL', 'NULL')) + ");\n"
    sql += "EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'original-bridge-root-temp-relations-required' THEN RAISE;END IF;caught:=true;END;IF NOT caught THEN RAISE EXCEPTION 'original-bridge-receipt-denial-missing';END IF;checks:=checks+1;\n"
    sql += "PERFORM set_config('helmut.bridge_negative_checks',checks::text,true);END;$runtime_probe$;RESET ROLE;RESET SESSION AUTHORIZATION;\n"
    return sql, len(denied) + 1


def install_bridge(query, *, database, operation_id, command_canonical, command_sha256, proposal_pin, original_source_pins):
    """Consume one preparation attempt; return only confirmed native metadata."""
    try:
        _need(callable(query) and os.getuid() == os.geteuid() == os.getgid() == os.getegid() == 1000 and not os.environ.get('VERCEL'), 'source-local-owner')
        _need(type(operation_id) is str and re.fullmatch('localUnitDiagnostic-[a-f0-9]{32}', operation_id)
              and database == 'helmut_unit_diagnostic_' + operation_id[-32:], 'owned-copy-name')
        _need(type(command_canonical) is str and 2 <= len(command_canonical.encode('utf8')) <= 16 * 1024**2
              and type(command_sha256) is str and re.fullmatch('[a-f0-9]{64}', command_sha256) and _sha(command_canonical) == command_sha256, 'command-bytes')
        command = _parse(command_canonical)
        _need(type(command) is dict and set(command) == {'version', 'mode', 'source', 'calendar', 'target', 'gatePins', 'requestPins', 'drafts', 'units', 'slot', 'limits'}
              and command.get('version') == 'helmut-local-unit-diagnostic-command/1' and command.get('mode') == 'D-R-1-local-fixture'
              and command['target']['database'] == database and command['slot']['plan']['operationId'] == operation_id
              and type(command['limits']['units']) is int and command['limits']['units'] == 1 and command['limits']['production'] is False and command['limits']['paidProviderCallsAllowed'] is False
              and type(command['source']['sourceIndex']) is int and command['source']['sourceIndex'] == 499
              and type(command['source']['diagnosticUnit']) is int and command['source']['diagnosticUnit'] == 0
              and len(command['units']) == len(command['drafts']) == 1 and command['units'][0]['kind'] == 'DR', 'genuine-command-scope')
        proposal, files, original, native, helpers = _sources(proposal_pin)
        input_pins = _parse(_json(original_source_pins))
        _need(type(input_pins) is list and 15 <= len(input_pins) <= 128 and all(type(p) is dict and set(p) in (SOURCE_KEYS, SOURCE_KEYS | {'securityDefiner'}) for p in input_pins)
              and len({p['oid'] for p in input_pins}) == len(input_pins)
              and all(p.get('securityDefiner', False) is False for p in input_pins), 'original-input-pins')
        _need(database not in _attempted, 'attempt-already-consumed')
        _attempted.add(database)
        prefix = "BEGIN;SET LOCAL standard_conforming_strings=on;SET LOCAL search_path=pg_catalog;SET LOCAL row_security=on;SET LOCAL statement_timeout='25s';SET LOCAL lock_timeout='500ms';SET LOCAL helmut.local_usage_experiment='on';\n"
        pre_native = {k: v for k, v in native.items() if k not in helpers}
        before = _call(query, database, prefix + _guard(database, command_sha256, installed=False) + _catalog_sql(database, command_sha256) + 'ROLLBACK;', 'BRIDGE_SOURCE_CATALOG')
        _need(before['negativeChecks'] == 0 and before['contract'] is None and before['originalRelations'] == [], 'preinstall-catalog')
        orig, _ = _validate_catalog(before, database, command_sha256, original, pre_native, input_pins)
        install_q = {'schema': 'helmut-local-unit-original-bridge-install/1', 'database': database, 'operationId': operation_id, 'commandHash': command_sha256, 'originalSources': orig}
        # The proposal keeps its own BEGIN/COMMIT byte-for-byte. Session GUCs
        # survive that BEGIN and emit no preliminary SELECT/ACK to the callback.
        setup = "SET standard_conforming_strings=on;SET search_path=pg_catalog;SET row_security=on;SET statement_timeout='25s';SET lock_timeout='500ms';SET helmut.local_usage_experiment='on';\n"
        setup += 'DO $bridge_settings$ BEGIN PERFORM set_config(\'helmut.local_unit_original_bridge_install_target\',' + _q(database) + ",false);PERFORM set_config('helmut.local_unit_original_bridge_install'," + _q(_json(install_q)) + ',false);END;$bridge_settings$;\n'
        # Install commit is only preparation. The independent qualification
        # below must still pass; unknown outcomes never lead to an install retry.
        installed = _call(query, database, setup + proposal + '\n' + _writer_read_probe_sql(database) + prefix + _guard(database, command_sha256, installed=True)
                          + _security_sql(database) + _probes_sql(database, command_sha256)[0]
                          + _catalog_sql(database, command_sha256, installed=True) + 'ROLLBACK;', 'BRIDGE_INSTALL_AND_QUALIFY')
        orig_after, natives = _validate_catalog(installed, database, command_sha256, original, native, input_pins)
        _need(type(installed['negativeChecks']) is int and installed['negativeChecks'] == _probes_sql(database, command_sha256)[1], 'native-negative-count')
        _need(orig_after == orig and all(installed[k] == before[k] for k in ('databaseOID', 'authHash', 'legacyRead', 'triggerFunctions')), 'original-or-read-closure-drift')
        relations = installed['originalRelations']
        _need(type(relations) is list and len(relations) == 5 and {r['name'] for r in relations} == {'public.' + t for t in TABLES}
              and len(_json(relations).encode()) <= 512 * 1024 and all(type(r['oid']) is str and re.fullmatch('[1-9][0-9]*', r['oid']) for r in relations), 'five-actual-relations')
        contract = installed['contract']
        expected_sources = {s['name'] + '(' + s['identityArguments'] + ')': s['prosrcSHA256'] for s in natives}
        _need(type(contract) is dict and set(contract) == {'version', 'database', 'databaseOID', 'sources', 'legacyReadRPCs', 'sourceQualified'}
              and contract['version'] == 'helmut-local-unit-diagnostic-native-store/1' and contract['database'] == database and contract['databaseOID'] == before['databaseOID']
              and contract['sourceQualified'] is False and contract['sources'] == expected_sources
              and type(contract['legacyReadRPCs']) is list and len(contract['legacyReadRPCs']) == 2, 'actual-runtime-contract')
        readback = _call(query, database, _writer_read_probe_sql(database) + prefix + _guard(database, command_sha256, installed=True) + _security_sql(database)
                         + _probes_sql(database, command_sha256)[0] + _catalog_sql(database, command_sha256, installed=True) + 'ROLLBACK;', 'BRIDGE_FRESH_READBACK')
        _need(readback == installed, 'fresh-readback-drift')
        for pin in files.values():
            _file(pin['path'], pin)
        qualification = {'schema': 'helmut-local-unit-original-bridge-qualification/1', 'database': database, 'operationId': operation_id,
                         'commandHash': command_sha256, 'originalSources': orig, 'helperSources': [s for s in natives if s['name'] in helpers],
                         'nativeSources': natives, 'originalRelations': relations}
        return {'schema': 'helmut-local-unit-native-bridge-preparation/1', 'qualification': qualification, 'actualContractSources': contract['sources'],
                'allNativeSources': natives, 'sourcePins': files, 'nativeCatalogSHA256': _sha(_json(installed)),
                'executedNegativeChecks': installed['negativeChecks'] + readback['negativeChecks'], 'freshReadbackConfirmed': True,
                'probeSessionOrigin': 'initial-postgres-with-set-session-authorization',
                'preparationOnly': True, 'executionAuthorityInstalled': False, 'nativeWriteTransactionQualified': False,
                'unit60Qualified': False, 'full500ReserveQualified': False, 'full500': False}
    except Exception:
        raise BridgeQualificationError('native-original-bridge-install-or-qualification-failed') from None
