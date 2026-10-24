"""Append an actual SOURCE-controller observation; never grant/run a unit.

The trusted controller supplies the confirmed Seed authority/initial tip and an
actual post-install ``observation_catalog_sql()`` readback as a PRIVATE baseline.
It schedules this operation at most 15 seconds apart and stops the diagnostic on
any exception. Authority/Auth30/Unit60/lease/send deadlines are never extended.

``query(database, sql, label)`` MUST be the FD-pinned native worker.query, which
uses initial-postgres, ON_ERROR_STOP, bounded private captures, child exit zero
and BOTH pipe EOFs before returning text. SQL returns its sole ACK AFTER COMMIT.
A timeout, lost ACK, post-COMMIT guard failure or incomplete durable attempt is
terminal; neither this module nor a restarted controller may retry/reconcile it.

``source_observer`` is the real pinned SourceServiceObserver in UID1000 SOURCE.
The independently pinned ``verify_host_and_closure`` callable must perform actual
host/controller checks (or validate a fresh authenticated closed host exchange):
container IDs/image/PID namespaces/parentage, exact RO mounts and immutable source
identities, client/PostgREST/root-broker process and socket/code/config identities,
shared cgroup membership/limits/events and complete allowed live-process closure.
It receives observed_at_utc, sample_started_ns and baseline_hash and returns None
ONLY after those checks. A caller's qualified DTO is not accepted. Both callbacks
must be bounded by the outer native controller; in-process Python cannot interrupt
a hung host callback. No UID0->UID1000 /proc visibility is assumed.

Baseline exact fields are documented in BASELINE_KEYS below. ``files`` is an
exact list of {logical,physical} FD pins for the two manifests, every code/runtime
manifest entry and ten gates. Different paths are allowed ONLY for byte-identical
RO bindings independently verified by the host callback. Original RAW/auth/source
objects are not re-expanded or modified here; their verified immutable source
closure is the host callback's responsibility. Mutable COPY main-auth is allowed
to progress through the genuine original bridge. All baseline/catalog/ledger data
are PRIVATE, including policies/IDs; never print them or raw SQL errors.
"""
import datetime
import hashlib
import inspect
import json
import os
from pathlib import Path
import re
import stat
import threading
import time
import types


class ObservationError(RuntimeError):
    pass


BASELINE_KEYS = {'schema', 'database', 'databaseOID', 'operationId', 'commandHash',
                 'authority', 'initialTip', 'sourceBinding', 'pins', 'files',
                 'catalog', 'attemptDirectory', 'hostVerifierFunction'}
AUTHORITY_KEYS = {'grantId', 'commandCanonical', 'admissionCanonical', 'admissionHash',
                  'sourceHash', 'targetHash', 'postrunHash', 'sourceProofHash',
                  'codeManifestPin', 'runtimeManifestPin', 'gateHashes', 'verifierCodeHash',
                  'requestModels', 'verifiedAtUTC', 'expiresAtUTC'}
GATES = {'source', 'runtime', 'owner', 'calendar', 'costs', 'reservation', 'sender',
         'review', 'result', 'independentAcceptance'}
TIP_KEYS = {'ordinal', 'proofHash', 'observedAtUTC'}
PROOF_KEYS = {'operationId', 'commandHash', 'sourceHash', 'targetHash', 'postrunSHA256',
              'gateHashes', 'codeManifestHash', 'runtimeManifestHash', 'databaseOID', 'observedAtUTC'}
CATALOG_KEYS = {'database', 'databaseOID', 'functions', 'relations', 'roles',
                'memberships', 'schemas', 'databaseACL', 'readRegistry'}
RPCS = ('contract', 'authority_read', 'runtime_read', 'control_runtime_read', 'control_snapshot_read', 'state_read', 'state_cas',
        'artifact_insert', 'artifact_read', 'lease_acquire', 'lease_release')
MAX_NS = 15_000_000_000
_active = set()
_sealed = set()
_lock = threading.Lock()


def _need(ok, code):
    if not ok:
        raise ObservationError('native-observation-' + code)


def _json(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True, allow_nan=False)


def _sha(raw):
    return hashlib.sha256(raw.encode('utf8') if isinstance(raw, str) else raw).hexdigest()


def _parse(raw):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            _need(key not in result, 'duplicate-json')
            result[key] = value
        return result
    return json.loads(raw, object_pairs_hook=unique,
                      parse_constant=lambda _: (_ for _ in ()).throw(ValueError('constant')))


def _hash(value):
    return type(value) is str and re.fullmatch('[a-f0-9]{64}', value) is not None


def _utc(value):
    _need(type(value) is str and re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z', value), 'utc')
    result = datetime.datetime.fromisoformat(value.replace('Z', '+00:00'))
    _need(result.isoformat(timespec='milliseconds').replace('+00:00', 'Z') == value, 'utc')
    return result


def _now():
    return datetime.datetime.now(datetime.timezone.utc)


def _text_time(value):
    return value.isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def _tip(tip):
    _need(type(tip) is dict and set(tip) == TIP_KEYS and type(tip['ordinal']) is int
          and 0 < tip['ordinal'] <= 9007199254740991 and _hash(tip['proofHash']), 'tip')
    _utc(tip['observedAtUTC'])


def _pin(pin):
    _need(type(pin) is dict and set(pin) == {'path', 'bytes', 'sha256'}
          and type(pin['path']) is str and type(pin['bytes']) is int
          and 0 < pin['bytes'] <= 1024**3 and _hash(pin['sha256']), 'pin')
    path = Path(pin['path'])
    _need(path.is_absolute() and str(path) == pin['path'] and path.resolve() == path, 'pin-path')


def _identity(s):
    return tuple(getattr(s, k) for k in ('st_dev', 'st_ino', 'st_mode', 'st_uid', 'st_gid',
                                        'st_nlink', 'st_size', 'st_mtime_ns', 'st_ctime_ns'))


def _read(pin, *, content=False):
    _pin(pin)
    _need(not content or pin['bytes'] <= 4 * 1024**2, 'metadata-cap')
    path = Path(pin['path'])
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(fd)
        _need(stat.S_ISREG(before.st_mode) and before.st_nlink == 1
              and before.st_size == pin['bytes'], 'file-metadata')
        h, size, blocks = hashlib.sha256(), 0, []
        while block := os.read(fd, 65536):
            size += len(block)
            _need(size <= pin['bytes'], 'file-growth')
            h.update(block)
            if content:
                blocks.append(block)
        _need(size == pin['bytes'] and h.hexdigest() == pin['sha256']
              and _identity(before) == _identity(os.fstat(fd)) == _identity(path.lstat()), 'file-drift')
        return b''.join(blocks) if content else None
    finally:
        os.close(fd)


def _codes(code):
    yield code
    for value in code.co_consts:
        if isinstance(value, types.CodeType):
            yield from _codes(value)


def _callable(callback, pin, *, name=None):
    _need(inspect.isfunction(callback) or inspect.ismethod(callback), 'actual-callable')
    function = callback.__func__ if inspect.ismethod(callback) else callback
    _need(function.__code__.co_filename == pin['path'] and (name is None or function.__qualname__ == name), 'callable-origin')
    code = compile(_read(pin, content=True), pin['path'], 'exec', dont_inherit=True)
    _need(any(c.co_qualname == function.__qualname__ and c == function.__code__ for c in _codes(code)), 'callable-code')


def _catalog_select():
    """Closed catalog expression; caller always establishes pg_catalog context."""

    rpcs = ','.join("'local_unit_diagnostic_" + n + "_v1'" for n in RPCS)
    return """WITH selected_rel AS (
 SELECT c.*,n.nspname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='helmut_unit_diagnostic' OR n.nspname='public' AND c.relname IN
 ('helmut_store','helmut_auth_state_nodes_local','llm_usage','briefings','profiles')
), selected_proc AS (
 SELECT p.* FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='helmut_unit_diagnostic' OR n.nspname='public' AND
 (p.proname LIKE 'helmut_auth_%' OR p.proname IN (@RPCS@)
 OR p.oid IN(SELECT tgfoid FROM pg_trigger WHERE tgrelid IN(SELECT oid FROM selected_rel) AND NOT tgisinternal))
)
SELECT jsonb_build_object('database',current_database(),
 'databaseOID',(SELECT oid::text FROM pg_database WHERE datname=current_database()),
 'functions',(SELECT coalesce(jsonb_agg(jsonb_build_object('oid',p.oid::text,
  'signature',n.nspname||'.'||p.proname||'('||oidvectortypes(p.proargtypes)||')',
  'sha256',encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'),'owner',p.proowner::text,
  'acl',to_jsonb(p.proacl),'config',to_jsonb(p.proconfig),'definer',p.prosecdef,
  'volatility',p.provolatile::text,'kind',p.prokind::text,'language',l.lanname,
  'returnType',format_type(p.prorettype,NULL),'leakproof',p.proleakproof,'strict',p.proisstrict,
  'parallel',p.proparallel::text,'support',p.prosupport::text,'argModes',to_jsonb(p.proargmodes),
  'argNames',to_jsonb(p.proargnames),'allArgTypes',to_jsonb(p.proallargtypes::bigint[]),
  'defaults',pg_get_expr(p.proargdefaults,0)) ORDER BY p.oid),'[]'::jsonb)
  FROM selected_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang),
 'relations',(SELECT coalesce(jsonb_agg(jsonb_build_object('oid',c.oid::text,'name',c.nspname||'.'||c.relname,
  'owner',c.relowner::text,'kind',c.relkind::text,'partition',c.relispartition,'acl',to_jsonb(c.relacl),
  'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,
  'columns',(SELECT coalesce(jsonb_agg(jsonb_build_object('number',a.attnum,'name',a.attname,'type',a.atttypid::text,
    'typmod',a.atttypmod,'notNull',a.attnotnull,'dropped',a.attisdropped,'identity',a.attidentity::text,
    'generated',a.attgenerated::text,'acl',to_jsonb(a.attacl)) ORDER BY a.attnum),'[]'::jsonb)
    FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0),
  'constraints',(SELECT coalesce(jsonb_agg(pg_get_constraintdef(k.oid,true) ORDER BY k.oid),'[]'::jsonb) FROM pg_constraint k WHERE k.conrelid=c.oid),
  'policies',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',v.polname,'command',v.polcmd::text,
    'permissive',v.polpermissive,'roles',to_jsonb(v.polroles::bigint[]),
    'using',pg_get_expr(v.polqual,v.polrelid),'check',pg_get_expr(v.polwithcheck,v.polrelid)) ORDER BY v.polname),'[]'::jsonb)
    FROM pg_policy v WHERE v.polrelid=c.oid),
  'triggers',(SELECT coalesce(jsonb_agg(jsonb_build_object('oid',t.oid::text,'name',t.tgname,
    'enabled',t.tgenabled::text,'internal',t.tgisinternal,'functionOID',t.tgfoid::text,
    'definition',pg_get_triggerdef(t.oid,true)) ORDER BY t.oid),'[]'::jsonb) FROM pg_trigger t WHERE t.tgrelid=c.oid),
  'parents',(SELECT coalesce(jsonb_agg(i.inhparent::text ORDER BY i.inhseqno),'[]'::jsonb) FROM pg_inherits i WHERE i.inhrelid=c.oid)
  ) ORDER BY c.oid),'[]'::jsonb) FROM selected_rel c),
 'roles',(SELECT jsonb_agg(jsonb_build_object('oid',r.oid::text,'name',r.rolname,'super',r.rolsuper,
  'inherit',r.rolinherit,'createRole',r.rolcreaterole,'createDB',r.rolcreatedb,'login',r.rolcanlogin,
  'replication',r.rolreplication,'bypassRls',r.rolbypassrls,'config',to_jsonb(r.rolconfig),'connections',r.rolconnlimit)
  ORDER BY r.oid) FROM pg_roles r WHERE r.rolname IN
  ('helmut_ud_owner_'||right(current_database(),32),'helmut_ud_runtime_'||right(current_database(),32),
   'helmut_ud_authenticator_'||right(current_database(),32),'helmut_ud_bridge_writer_'||right(current_database(),32))),
 'memberships',(SELECT coalesce(jsonb_agg(jsonb_build_object('role',m.roleid::text,'member',m.member::text,
  'grantor',m.grantor::text,'admin',m.admin_option,'inherit',m.inherit_option,'set',m.set_option)
  ORDER BY m.roleid,m.member,m.grantor),'[]'::jsonb) FROM pg_auth_members m
  WHERE m.roleid IN(SELECT oid FROM pg_roles WHERE rolname LIKE 'helmut_ud_%')
  OR m.member IN(SELECT oid FROM pg_roles WHERE rolname LIKE 'helmut_ud_%')),
 'schemas',(SELECT jsonb_agg(jsonb_build_object('oid',n.oid::text,'name',n.nspname,'owner',n.nspowner::text,'acl',to_jsonb(n.nspacl))
  ORDER BY n.oid) FROM pg_namespace n WHERE n.nspname IN('public','helmut_unit_diagnostic')),
 'databaseACL',(SELECT jsonb_build_object('owner',d.datdba::text,'acl',to_jsonb(d.datacl)) FROM pg_database d WHERE d.datname=current_database()),
 'readRegistry',(SELECT jsonb_agg(jsonb_build_object('function_name',q.function_name,'http_exposed',q.http_exposed,
  'function_oid',q.function_oid::bigint,'identity_arguments',q.identity_arguments,
  'prosrc_sha256',q.prosrc_sha256,'qualification_pin',q.qualification_pin) ORDER BY q.function_name)
  FROM helmut_unit_diagnostic.legacy_read_rpcs q));
""".replace('@RPCS@', rpcs)


def observation_catalog_sql():
    """Read-only transaction for the actual PRIVATE post-Bridge baseline.

    Use the bounded pinned Source query callback. Capture before updater start;
    Seed changes no catalog metadata. This read is neither authority nor a grant.
    The explicit pg_catalog context MUST match periodic deparse/hash consumers.
    OIDs use text/bigint codecs; no implicit to_jsonb(oid) comparison is used.
    """
    return ("BEGIN READ ONLY;\nSET LOCAL search_path=pg_catalog;\n"
            "SET LOCAL statement_timeout='8s';\n" + _catalog_select() + "COMMIT;\n")


def _validate(baseline, expected_previous):
    _need(type(baseline) is dict and set(baseline) == BASELINE_KEYS
          and len(_json(baseline).encode()) <= 4 * 1024**2, 'baseline-shape')
    b = _parse(_json(baseline))  # Detach caller-owned mutable containers.
    _need(b['schema'] == 'helmut-local-unit-observation-baseline/1'
          and type(b['operationId']) is str and re.fullmatch('localUnitDiagnostic-[a-f0-9]{32}', b['operationId'])
          and b['database'] == 'helmut_unit_diagnostic_' + b['operationId'][-32:]
          and type(b['databaseOID']) is str and re.fullmatch('[1-9][0-9]{0,9}', b['databaseOID'])
          and int(b['databaseOID']) <= 4294967295 and _hash(b['commandHash']), 'scope')
    a = b['authority']
    _need(type(a) is dict and set(a) == AUTHORITY_KEYS, 'authority')
    for k in ('grantId', 'admissionHash', 'sourceHash', 'targetHash', 'postrunHash', 'sourceProofHash', 'verifierCodeHash'):
        _need(_hash(a[k]), 'authority-hash')
    _need(type(a['commandCanonical']) is str and _sha(a['commandCanonical']) == b['commandHash']
          and type(a['admissionCanonical']) is str and _sha(a['admissionCanonical']) == a['admissionHash'], 'authority-canonical-hash')
    command, admission = _parse(a['commandCanonical']), _parse(a['admissionCanonical'])
    _need(command['version'] == 'helmut-local-unit-diagnostic-command/1' and command['mode'] == 'D-R-1-local-fixture'
          and command['target']['database'] == b['database'] and command['slot']['plan']['operationId'] == b['operationId']
          and command['source']['sourceIndex'] == 499 and command['source']['diagnosticUnit'] == 0
          and len(command['units']) == len(command['drafts']) == 1
          and command['limits']['unitMs'] == 60000 and command['limits']['authMs'] == 30000
          and command['limits']['controlsPerUnit'] == 16 and command['limits']['units'] == 1
          and command['limits']['production'] is False and command['limits']['paidProviderCallsAllowed'] is False
          and admission['commandHash'] == b['commandHash'] and admission['grantId'] == a['grantId']
          and admission['expiresAtUTC'] == command['calendar']['endsAtUTC'] == a['expiresAtUTC'], 'diagnostic-only')
    _need(type(a['gateHashes']) is dict and set(a['gateHashes']) == GATES and set(command['gatePins']) == GATES
          and all(_hash(v) and command['gatePins'][k]['sha256'] == v for k, v in a['gateHashes'].items())
          and a['requestModels'] in ({'D': 'gpt-5-mini', 'R': 'gpt-5-mini'}, {'D': 'gpt-5-mini-eu', 'R': 'gpt-5-mini-eu'}), 'gates-models')
    _need(_utc(a['verifiedAtUTC']) < _utc(a['expiresAtUTC']), 'authority-window')
    _tip(b['initialTip']); _tip(expected_previous)
    _need(type(b['pins']) is dict and set(b['pins']) == {'observer', 'hostVerifier', 'query'}, 'callback-pins')
    _need(type(b['hostVerifierFunction']) is str and 0 < len(b['hostVerifierFunction']) <= 256
          and re.fullmatch(r'(?:[A-Za-z_][A-Za-z0-9_]*|<locals>)(?:\.(?:[A-Za-z_][A-Za-z0-9_]*|<locals>))*',
                           b['hostVerifierFunction']), 'host-function-name')
    for pin in b['pins'].values():
        _pin(pin)
    s = b['sourceBinding']
    _need(type(s) is dict and s.get('schema') == 'helmut-local-unit-original-source-binding/1'
          and all(s.get(k) == b[k] for k in ('operationId', 'commandHash', 'database'))
          and s.get('socketPath') == '/ram/helmut-original-write-bridge.sock'
          and s.get('service', {}).get('uid') == s.get('supervisor', {}).get('uid') == 1000, 'source-binding')
    c = b['catalog']
    _need(type(c) is dict and set(c) == CATALOG_KEYS and c['database'] == b['database']
          and c['databaseOID'] == b['databaseOID'] and len(c['roles']) == 4
          and len(c['readRegistry']) == 6 and sum(r['http_exposed'] is True for r in c['readRegistry']) == 2
          and type(c['functions']) is list and len(c['functions']) >= 36, 'actual-catalog-baseline')
    _need(type(b['files']) is list and 2 <= len(b['files']) <= 6012, 'file-bindings')
    return b, command


def _closure(b, command):
    bindings, total = {}, 0
    for row in b['files']:
        _need(type(row) is dict and set(row) == {'logical', 'physical'}, 'file-binding')
        logical, physical = row['logical'], row['physical']
        for pin in (logical, physical):
            _pin(pin)
        _need(logical['bytes'] == physical['bytes'] and logical['sha256'] == physical['sha256']
              and logical['path'] not in bindings, 'byte-identical-binding')
        bindings[logical['path']] = row
        total += physical['bytes']
        _need(total <= 1024**3, 'closure-budget')
    def contents(pin):
        _pin(pin)
        _need(pin['path'] in bindings and bindings[pin['path']]['logical'] == pin, 'missing-binding')
        return _parse(_read(bindings[pin['path']]['physical'], content=True).decode('utf8', errors='strict'))
    a = b['authority']
    code, runtime = contents(a['codeManifestPin']), contents(a['runtimeManifestPin'])
    _need(type(code) is dict and set(code) == {'schema', 'files'} and code['schema'] == 'helmut-local-unit-diagnostic-code-manifest/1'
          and type(runtime) is dict and set(runtime) == {'schema', 'database', 'sqlSources', 'files', 'transport'}
          and runtime['schema'] == 'helmut-local-unit-diagnostic-runtime-manifest/1' and runtime['database'] == b['database']
          and all(type(v) is list and 0 < len(v) <= 3000 for v in (code['files'], runtime['files']))
          and runtime['sqlSources'] == {f['signature']: f['sha256'] for f in b['catalog']['functions']
              if f['signature'].startswith('helmut_unit_diagnostic.') or f['signature'].split('(')[0] in
              {'public.local_unit_diagnostic_' + n + '_v1' for n in RPCS}}
          and a['runtimeManifestPin']['sha256'] == command['slot']['plan']['runtimeManifestHash'], 'actual-manifests')
    required = [a['codeManifestPin'], a['runtimeManifestPin']] + code['files'] + runtime['files'] + list(command['gatePins'].values())
    expected = {}
    for pin in required:
        _pin(pin)
        _need(pin['path'] not in expected or expected[pin['path']] == pin, 'conflicting-closure-pin')
        expected[pin['path']] = pin
    _need(set(expected) == set(bindings) and all(bindings[k]['logical'] == p for k, p in expected.items()), 'exact-file-closure')
    code_hashes = {p['sha256'] for p in code['files']}
    self_pins = [r['physical'] for r in bindings.values()
                 if r['logical'] in code['files'] and r['physical']['path'] == str(Path(__file__).resolve())]
    _need(a['verifierCodeHash'] in code_hashes
          and all(p['sha256'] in code_hashes for p in b['pins'].values()) and len(self_pins) == 1, 'callback-measured-code')
    _callable(append_observation, self_pins[0], name='append_observation')
    for row in bindings.values():
        _read(row['physical'])


def _source(b, observer):
    pin = b['pins']['observer']
    _need(pin['path'].endswith('/local-unit-native-source-qualification.py')
          and type(observer).__name__ == 'SourceServiceObserver', 'genuine-observer')
    for name in ('__init__', 'check', 'qualification'):
        _callable(getattr(observer, name), pin, name='SourceServiceObserver.' + name)
    _need(observer.binding == b['sourceBinding'], 'observer-binding-drift')
    q = observer.qualification()  # Actual process/cgroup/file/listener checks.
    _need(type(q) is dict and set(q) == {'schema', 'operationId', 'commandHash', 'database', 'issuedAtUTC', 'expiresAtUTC', 'publicSourceBinding'}
          and q['schema'] == 'helmut-local-unit-source-supervisor-qualification/1'
          and all(q[k] == b[k] for k in ('operationId', 'commandHash', 'database'))
          and q['publicSourceBinding'] == b['sourceBinding']
          and _utc(q['issuedAtUTC']) <= _now() < _utc(q['expiresAtUTC']) == _utc(b['authority']['expiresAtUTC'])
          and 0 <= (_now() - _utc(q['issuedAtUTC'])).total_seconds() <= 1, 'fresh-source-observer')
    return _sha(_json(q))


def _q(text):
    _need(type(text) is str and '\0' not in text, 'sql-text')
    return "'" + text.replace("'", "''") + "'"


def _sql(b, previous, proof, canonical, digest):
    scope, suffix = b['commandHash'], b['database'][-32:]
    owner, auth, runtime = ('helmut_ud_' + role + '_' + suffix for role in ('owner', 'authenticator', 'runtime'))
    # Capture no data rows in the catalog baseline. Check raw pg_proc before any
    # diagnostic helper is called. Do not reuse PLpgSQL record names as aliases.
    catalog = _catalog_select().strip().rstrip(';')
    authority = ','.join(_q(key) + ',a.' + column for key, column in (
        ('grantId', 'grant_id'), ('commandCanonical', 'command_canonical'), ('admissionCanonical', 'admission_canonical'),
        ('admissionHash', 'admission_hash'), ('sourceHash', 'source_hash'), ('targetHash', 'target_hash'),
        ('postrunHash', 'postrun_hash'), ('sourceProofHash', 'source_proof_hash'), ('codeManifestPin', 'code_manifest_pin'),
        ('runtimeManifestPin', 'runtime_manifest_pin'), ('gateHashes', 'gate_hashes'), ('verifierCodeHash', 'verifier_code_hash'),
        ('requestModels', 'request_models')))
    authority += ", 'verifiedAtUTC',to_char(a.verified_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'),'expiresAtUTC',to_char(a.expires_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"')"
    tip = "jsonb_build_object('ordinal',r.ordinal,'proofHash',r.proof_hash,'observedAtUTC',to_char(r.observed_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'))"
    sql_template = """BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL row_security=on;
SET LOCAL standard_conforming_strings=on;
SET LOCAL statement_timeout='8s';
SET LOCAL lock_timeout='500ms';
SET LOCAL idle_in_transaction_session_timeout='2s';
DO @BOUNDARYTAG@ BEGIN
 IF current_database()<>@DB@ OR (SELECT oid::text FROM pg_database WHERE datname=current_database())<>@OID@
  OR session_user<>'postgres' OR current_user<>session_user
  OR NOT EXISTS(SELECT FROM pg_roles WHERE rolname=session_user AND rolsuper)
  OR current_setting('server_version_num')::integer NOT BETWEEN 170000 AND 179999
  OR current_setting('server_encoding')<>'UTF8' OR current_setting('client_encoding')<>'UTF8'
 THEN RAISE EXCEPTION 'observation-source-copy-boundary';END IF;
 IF (@CATALOGSQL@) IS DISTINCT FROM @CATALOG@::jsonb THEN RAISE EXCEPTION 'observation-native-catalog-drift';END IF;
END;@BOUNDARYTAG@;
SET SESSION AUTHORIZATION @AUTH@;
SET ROLE @RUNTIME@;
DO @CONTRACTTAG@ DECLARE contract_value jsonb; BEGIN
 contract_value:=public.local_unit_diagnostic_contract_v1();
 IF contract_value->>'version' IS DISTINCT FROM 'helmut-local-unit-diagnostic-native-store/1'
  OR contract_value->>'database' IS DISTINCT FROM @DB@ OR contract_value->>'databaseOID' IS DISTINCT FROM @OID@
  OR contract_value->'sources' IS DISTINCT FROM @SOURCES@::jsonb OR contract_value->'sourceQualified' IS DISTINCT FROM 'false'::jsonb
 THEN RAISE EXCEPTION 'observation-native-contract';END IF;
END;@CONTRACTTAG@;
RESET ROLE;
RESET SESSION AUTHORIZATION;
SET SESSION AUTHORIZATION @OWNER@;
DO @APPENDTAG@ DECLARE a helmut_unit_diagnostic.authority%rowtype; r helmut_unit_diagnostic.runtime_observations%rowtype;
 inserted_ordinal bigint; BEGIN
 IF session_user<>@OWNERLIT@ OR current_user<>session_user THEN RAISE EXCEPTION 'observation-owner-required';END IF;
 SELECT * INTO STRICT a FROM helmut_unit_diagnostic.authority WHERE scope_hash=@SCOPE@ FOR UPDATE;
 IF a.operation_id IS DISTINCT FROM @OP@ OR jsonb_build_object(@AUTHORITYDTO@) IS DISTINCT FROM @AUTHORITY@::jsonb
  OR clock_timestamp()>=a.expires_at OR @AT@::timestamptz>=a.expires_at
  OR clock_timestamp()<@AT@::timestamptz OR clock_timestamp()-@AT@::timestamptz>interval '15 seconds'
  OR NOT EXISTS(SELECT FROM helmut_unit_diagnostic.state WHERE scope_hash=@SCOPE@)
 THEN RAISE EXCEPTION 'observation-authority-or-seed';END IF;
 SELECT * INTO STRICT r FROM helmut_unit_diagnostic.runtime_observations WHERE scope_hash=@SCOPE@ ORDER BY ordinal DESC LIMIT 1;
 IF @TIPDTO@ IS DISTINCT FROM @PREVIOUS@::jsonb
  OR @AT@::timestamptz<=r.observed_at OR @AT@::timestamptz-r.observed_at>interval '15 seconds'
 THEN RAISE EXCEPTION 'observation-previous-tip';END IF;
 INSERT INTO helmut_unit_diagnostic.runtime_observations(scope_hash,proof_canonical,proof_hash,observed_at)
 VALUES(@SCOPE@,@CANONICAL@,@DIGEST@,@AT@::timestamptz) RETURNING ordinal INTO STRICT inserted_ordinal;
 SELECT * INTO STRICT r FROM helmut_unit_diagnostic.runtime_observations WHERE scope_hash=@SCOPE@ ORDER BY ordinal DESC LIMIT 1;
 IF r.ordinal<>inserted_ordinal OR r.ordinal<=(@PREVIOUS@::jsonb->>'ordinal')::bigint
  OR r.ordinal>9007199254740991 OR r.proof_canonical IS DISTINCT FROM @CANONICAL@
  OR r.proof_hash IS DISTINCT FROM @DIGEST@ OR r.observed_at IS DISTINCT FROM @AT@::timestamptz
  OR encode(sha256(convert_to(r.proof_canonical,'UTF8')),'hex') IS DISTINCT FROM r.proof_hash
  OR clock_timestamp()>=a.expires_at OR clock_timestamp()-@AT@::timestamptz>interval '15 seconds'
 THEN RAISE EXCEPTION 'observation-insert-readback';END IF;
END;@APPENDTAG@;
RESET SESSION AUTHORIZATION;
COMMIT;
SELECT jsonb_build_object('schema','helmut-local-unit-observation-append-ack/1',
 'database',current_database(),'databaseOID',(SELECT oid::text FROM pg_database WHERE datname=current_database()),
 'operationId',@OP@,'commandHash',@SCOPE@,'previous',@PREVIOUS@::jsonb,
 'tip',@TIPDTO@,'canonical',r.proof_canonical)
FROM helmut_unit_diagnostic.runtime_observations r WHERE r.scope_hash=@SCOPE@ AND r.proof_hash=@DIGEST@;
"""
    values = {'CATALOGSQL': catalog, 'CATALOG': _q(_json(b['catalog'])), 'AUTHORITYDTO': authority,
              'TIPDTO': tip, 'AUTHORITY': _q(_json(b['authority'])), 'PREVIOUS': _q(_json(previous)),
              'SOURCES': _q(_json({f['signature']: f['sha256'] for f in b['catalog']['functions']
                  if f['signature'].startswith('helmut_unit_diagnostic.') or f['signature'].split('(')[0] in
                  {'public.local_unit_diagnostic_' + n + '_v1' for n in RPCS}})),
              'DB': _q(b['database']), 'OID': _q(b['databaseOID']), 'SCOPE': _q(scope),
              'OP': _q(b['operationId']), 'AT': _q(proof['observedAtUTC']), 'CANONICAL': _q(canonical),
              'DIGEST': _q(digest), 'OWNERLIT': _q(owner), 'OWNER': owner, 'AUTH': auth, 'RUNTIME': runtime}
    # PostgreSQL recognizes a DO dollar delimiter even inside a string literal
    # of its body. A fixed $append$ would therefore be unsafe for canonical JSON.
    tag_hash = _sha(_json(values))[:32]
    for key in ('BOUNDARYTAG', 'CONTRACTTAG', 'APPENDTAG'):
        tag = '$obs_' + key.lower() + '_' + tag_hash + '$'
        _need(all(tag not in value for value in values.values()), 'sql-dollar-delimiter')
        values[key] = tag
    return re.sub(r'@([A-Z]+)@', lambda match: values[match[1]], sql_template)


def _ack(raw, b, previous, canonical, digest, at):
    _need(type(raw) is str and 0 < len(raw.encode()) <= 131072, 'capture-text')
    value = _parse(raw)
    _need(type(value) is dict and set(value) == {'schema', 'database', 'databaseOID', 'operationId', 'commandHash', 'previous', 'tip', 'canonical'}
          and value['schema'] == 'helmut-local-unit-observation-append-ack/1'
          and all(value[k] == b[k] for k in ('database', 'databaseOID', 'operationId', 'commandHash'))
          and value['previous'] == previous and value['canonical'] == canonical, 'ack-binding')
    _tip(value['tip'])
    _need(value['tip']['ordinal'] > previous['ordinal'] and value['tip']['proofHash'] == digest
          and value['tip']['observedAtUTC'] == at, 'ack-tip')
    return value


def _write(directory, name, value):
    fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=directory)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(_json(value).encode()); stream.flush(); os.fsync(stream.fileno())
    os.fsync(directory)


def _read_entry(directory, name):
    fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory)
    try:
        before = os.fstat(fd)
        _need(stat.S_ISREG(before.st_mode) and before.st_uid == 1000 and before.st_nlink == 1
              and stat.S_IMODE(before.st_mode) == 0o600 and 0 < before.st_size <= 131072, 'ledger-entry')
        raw = os.read(fd, before.st_size + 1)
        _need(len(raw) == before.st_size and _identity(before) == _identity(os.fstat(fd))
              == _identity(os.stat(name, dir_fd=directory, follow_symlinks=False)), 'ledger-entry-drift')
        return _parse(raw.decode('utf8', errors='strict'))
    finally:
        os.close(fd)


def _ledger(b, baseline_hash, previous):
    path = Path(b['attemptDirectory'])
    _need(path.is_absolute() and str(path) == b['attemptDirectory'] and path.resolve() == path, 'ledger-path')
    directory = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        s = os.fstat(directory)
        _need(s.st_uid == 1000 and stat.S_IMODE(s.st_mode) == 0o700
              and _identity(s) == _identity(path.lstat()), 'ledger-directory')
        names = os.listdir(directory)
        _need(len(names) <= 258 and 'SEALED.PRIVATE.json' not in names, 'ledger-sealed-or-full')
        header = {'schema': 'helmut-local-unit-observation-ledger/1', 'baselineHash': baseline_hash, 'initialTip': b['initialTip']}
        if 'BASELINE.PRIVATE.json' not in names:
            _need(not names, 'ledger-uninitialized')
            _write(directory, 'BASELINE.PRIVATE.json', header)
        else:
            _need(_read_entry(directory, 'BASELINE.PRIVATE.json') == header, 'ledger-baseline')
        pending, committed = {}, {}
        for name in names:
            if name == 'BASELINE.PRIVATE.json':
                continue
            match = re.fullmatch(r'([a-f0-9]{64})\.(PENDING|COMMITTED)\.PRIVATE\.json', name)
            _need(match is not None, 'ledger-unexpected-file')
            target = pending if match[2] == 'PENDING' else committed
            target[match[1]] = _read_entry(directory, name)
        _need(set(pending) == set(committed), 'ledger-unknown-outcome')
        tip = b['initialTip']
        for key in sorted(pending, key=lambda k: pending[k]['previous']['ordinal']):
            attempt, done = pending[key], committed[key]
            _need(set(attempt) == {'baselineHash', 'previous', 'proofHash', 'observedAtUTC'}
                  and attempt['baselineHash'] == baseline_hash and attempt['previous'] == tip
                  and _sha(_json(attempt)) == key and set(done) == {'ack', 'audit'}, 'ledger-chain')
            ack = done['ack']
            _ack(_json(ack), b, tip, ack['canonical'], attempt['proofHash'], attempt['observedAtUTC'])
            _need(_sha(ack['canonical']) == attempt['proofHash'], 'ledger-proof-hash')
            tip = ack['tip']
        _need(tip == previous, 'ledger-expected-tip')
        return directory
    except BaseException:
        os.close(directory)
        raise


def append_observation(query, *, baseline, source_observer, verify_host_and_closure, expected_previous):
    """Return {tip, audit} only after committed ACK and fresh post-checks.

    Baseline requires schema ``helmut-local-unit-observation-baseline/1``;
    pins has observer/hostVerifier/query; initialTip/expected_previous are exactly
    {ordinal,proofHash,observedAtUTC}. attemptDirectory already exists privately
    (UID1000,0700) on the persistent COPY case. This function creates only its own
    O_EXCL/fsynced private ledger files there. Any error requires controller stop.
    """
    directory, scope, started, consumed, owns_active = None, None, time.monotonic_ns(), False, False
    observed_at = _text_time(_now())  # Before any external checks or hashing.
    try:
        _need(os.getuid() == os.geteuid() == os.getgid() == os.getegid() == 1000, 'source-user')
        b, command = _validate(baseline, expected_previous)
        previous = _parse(_json(expected_previous))
        scope, baseline_hash = b['commandHash'], _sha(_json(b))
        with _lock:
            _need(scope not in _active and scope not in _sealed, 'scope-active-or-sealed')
            _active.add(scope)
            owns_active = True
        directory = _ledger(b, baseline_hash, previous)
        attempt = {'baselineHash': baseline_hash, 'previous': previous, 'proofHash': None, 'observedAtUTC': observed_at}
        a = b['authority']
        proof = {'operationId': b['operationId'], 'commandHash': scope, 'sourceHash': a['sourceHash'],
                 'targetHash': a['targetHash'], 'postrunSHA256': a['postrunHash'], 'gateHashes': a['gateHashes'],
                 'codeManifestHash': a['codeManifestPin']['sha256'], 'runtimeManifestHash': a['runtimeManifestPin']['sha256'],
                 'databaseOID': b['databaseOID'], 'observedAtUTC': observed_at}
        _need(set(proof) == PROOF_KEYS, 'proof-fields')
        canonical, digest = _json(proof), _sha(_json(proof))
        attempt['proofHash'] = digest
        attempt_id = _sha(_json(attempt))
        _write(directory, attempt_id + '.PENDING.PRIVATE.json', attempt)
        consumed = True
        _need(_utc(previous['observedAtUTC']) < _utc(observed_at)
              and 0 < (_utc(observed_at) - _utc(previous['observedAtUTC'])).total_seconds() <= 15
              and _utc(observed_at) < _utc(a['expiresAtUTC']), 'sample-window')
        _need(b['pins']['query']['path'].endswith('/local-unit-native-worker.py'), 'genuine-query')
        _callable(query, b['pins']['query'], name='query')
        _callable(verify_host_and_closure, b['pins']['hostVerifier'], name=b['hostVerifierFunction'])
        kwargs = {'observed_at_utc': observed_at, 'sample_started_ns': started, 'baseline_hash': baseline_hash}
        source_before = _source(b, source_observer)
        _need(verify_host_and_closure(**kwargs) is None, 'host-guard-return')
        _closure(b, command)
        sql = _sql(b, previous, proof, canonical, digest)
        _need(time.monotonic_ns() - started <= MAX_NS and _now() < _utc(a['expiresAtUTC']), 'prequery-deadline')
        raw = query(b['database'], sql, 'RUNTIME_OBSERVATION_' + digest)
        ack = _ack(raw, b, previous, canonical, digest, observed_at)
        source_after = _source(b, source_observer)
        _need(verify_host_and_closure(**kwargs) is None, 'host-postguard-return')
        elapsed = time.monotonic_ns() - started
        _need(scope not in _sealed and 0 <= elapsed <= MAX_NS and 0 <= (_now() - _utc(observed_at)).total_seconds() <= 15
              and _now() < _utc(a['expiresAtUTC']), 'confirmed-deadline')
        audit = {'schema': 'helmut-local-unit-observation-audit/1', 'baselineHash': baseline_hash,
                 'observedAtUTC': observed_at, 'confirmedAtUTC': _text_time(_now()), 'elapsedNs': str(elapsed),
                 'sourceBeforeHash': source_before, 'sourceAfterHash': source_after,
                 'hostVerifierSHA256': b['pins']['hostVerifier']['sha256'], 'sqlSHA256': _sha(sql),
                 'queryBackend': 'owner-psql', 'initialSessionRole': 'postgres',
                 'unitExecutionQualified': False, 'full500Qualified': False, 'reserveQualified': False}
        _write(directory, attempt_id + '.COMMITTED.PRIVATE.json', {'ack': ack, 'audit': audit})
        # Persisting the confirmation must not turn a late return into success.
        # audit.elapsedNs measures through the actual post-ACK guards; callers
        # additionally measure the complete controller/capture/persistence span.
        _need(scope not in _sealed and 0 <= time.monotonic_ns() - started <= MAX_NS
              and _now() < _utc(a['expiresAtUTC']), 'durable-confirmation-deadline')
        return {'tip': ack['tip'], 'audit': audit}
    except BaseException:
        if scope is not None:
            _sealed.add(scope)
        if directory is not None and consumed:
            try:
                _write(directory, 'SEALED.PRIVATE.json', {'schema': 'helmut-local-unit-observation-terminal/1', 'reason': 'observation-not-confirmed'})
            except BaseException:
                pass  # Existing PENDING still seals a restart, even if disk failed.
        raise ObservationError('native-observation-not-confirmed-no-retry') from None
    finally:
        if directory is not None:
            os.close(directory)
        if owns_active:
            with _lock:
                _active.discard(scope)
