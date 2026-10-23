"""Once-only SOURCE coordinator for the explicitly authorized isolated COPY.

There is no CLI, transport injection, seed shortcut or recovery path. All native
I/O goes through the pinned worker, Node entry points and closed host channel.
SAFE stage records contain only identifiers/hashes; full receipts stay PRIVATE.
"""
import base64
import ctypes
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import time
import traceback
import unicodedata

BIN = Path(__file__).resolve().parent
GATES = ('source', 'runtime', 'owner', 'calendar', 'costs', 'reservation', 'sender',
         'review', 'result', 'independentAcceptance')
META = ('st_dev', 'st_ino', 'st_mode', 'st_uid', 'st_gid', 'st_nlink', 'st_size', 'st_mtime_ns', 'st_ctime_ns')
_attempted = set()


class ExecutionError(RuntimeError):
    pass


def need(ok, code):
    if not ok:
        raise ExecutionError('native-execution-controller-' + code)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False)


def sha(value):
    return hashlib.sha256(value.encode('utf8') if isinstance(value, str) else value).hexdigest()


def parse(raw):
    def unique(pairs):
        answer = {}
        for k, v in pairs:
            need(k not in answer, 'duplicate-json'); answer[k] = v
        return answer
    return json.loads(raw, object_pairs_hook=unique, parse_constant=lambda _: need(False, 'nonfinite-json'))


def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def plus_seconds(at, seconds):
    return (datetime.datetime.fromisoformat(at.replace('Z', '+00:00')) + datetime.timedelta(seconds=seconds)).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def _raw(path, cap):
    path = Path(path)
    need(path.is_absolute() and path.resolve() == path, 'private-canonical-path')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        a = os.fstat(fd)
        need(stat.S_ISREG(a.st_mode) and a.st_uid == 1000 and stat.S_IMODE(a.st_mode) == 0o600
             and a.st_nlink == 1 and 0 < a.st_size <= cap, 'private-file')
        blocks, size = [], 0
        while chunk := os.read(fd, min(65536, a.st_size - size + 1)):
            size += len(chunk); need(size <= a.st_size, 'private-growth'); blocks.append(chunk)
        b, named = os.fstat(fd), path.lstat()
        need(size == a.st_size and all(getattr(a, k) == getattr(b, k) == getattr(named, k) for k in META), 'private-drift')
        raw = b''.join(blocks)
        return raw, {'path': str(path), 'bytes': size, 'sha256': sha(raw)}, a
    finally:
        os.close(fd)


def _rename(source, target):
    libc = ctypes.CDLL(None, use_errno=True)
    rename = libc.renameat2
    rename.argtypes = (ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint)
    rename.restype = ctypes.c_int
    if rename(-100, os.fsencode(source), -100, os.fsencode(target), 1) != 0:
        raise OSError(ctypes.get_errno(), 'native-execution-no-replace-rename')


def _sync(directory):
    fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def _compact(worker, name, value):
    need(re.fullmatch('[A-Z_]+[.](?:PRIVATE|SAFE)[.]json', name), 'fixed-output-name')
    raw = json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode('utf8')
    need(0 < len(raw) <= 8 * 1024**2, 'private-output-cap')
    stage = worker.OUT / ('.' + name + '.stage-' + os.urandom(16).hex())
    fd = os.open(stage, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as out:
        out.write(raw); out.flush(); os.fsync(out.fileno())
    _rename(stage, worker.OUT / name); _sync(worker.OUT)
    actual, pin, _ = _raw(worker.OUT / name, 8 * 1024**2)
    need(actual == raw, 'private-output-readback'); return pin


def _move_prepared(worker, preparation):
    source, target = worker.OUT / 'client/PREPARED_COMMAND.PRIVATE.json', worker.OUT / 'PREPARED_COMMAND.PRIVATE.json'
    raw, before_pin, before = _raw(source, 16 * 1024**2)
    need(parse(raw) == preparation['prepared'], 'prepared-object-binding')
    _rename(source, target); _sync(source.parent); _sync(target.parent)
    actual, pin, after = _raw(target, 16 * 1024**2)
    need(actual == raw and all(getattr(before, k) == getattr(after, k) for k in META if k != 'st_ctime_ns')
         and pin['sha256'] == before_pin['sha256'] and not source.exists(), 'prepared-private-move')
    return pin


def _q(value):
    need(type(value) is str and '\0' not in value, 'sql-string')
    return "'" + value.replace("'", "''") + "'"


def _json_sql(value):
    return "convert_from(decode('" + base64.b64encode(canonical(value).encode()).decode() + "','base64'),'UTF8')::jsonb"


def _readonly(database, body):
    need(re.fullmatch('helmut_unit_diagnostic_[a-f0-9]{32}', database), 'owned-database')
    return ("BEGIN READ ONLY;SET LOCAL search_path=pg_catalog;SET LOCAL timezone='UTC';"
            "SET LOCAL statement_timeout='8s';SET LOCAL lock_timeout='500ms';SET LOCAL helmut.local_usage_experiment='on';\n"
            "DO $boundary$ BEGIN IF current_database()<>" + _q(database) + " OR session_user<>'postgres' OR current_user<>session_user"
            " OR current_setting('server_version_num')::integer NOT BETWEEN 170000 AND 179999"
            " OR current_setting('transaction_read_only')<>'on' THEN RAISE EXCEPTION 'execution-owned-readonly';END IF;END;$boundary$;\n"
            + body + '\nROLLBACK;')


def _call(worker, database, sql, label):
    value = worker.query(database, sql, label)
    need(type(value) in (str, bytes) and len(value) <= 4 * 1024**2, 'native-read-cap')
    return parse(value)


def _node_closed(child):
    need(child.child.returncode == 0 and len(child.eof) == 2 and all(flag is True for flag in child.eof), 'actual-node-close-and-eof')


def _shutdown_policy_sources(worker, plan):
    expected = plan['shutdownPolicyPins']
    need(type(expected) is list and len(expected) == 8, 'owner-shutdown-source-count')
    actual = [worker.pin('/opt/postgrest-close-source-%02d' % i) for i in range(8)]
    need(actual == expected, 'actual-owner-shutdown-source-pins')
    return actual


def _publication_probe(command, selection):
    need(type(command) is dict and sha(canonical(command)) == selection['commandHash'], 'publication-command-binding')
    rows = command['drafts'][0]['sources']['knowledgeObjects']
    need(type(rows) is list and 1 <= len(rows) <= 500, 'publication-selected-knowledge-objects')
    ids = [row['id'] for row in rows]
    need(all(type(value) is str and 1 <= len(value) <= 250
             and all(ch in '_-' or unicodedata.category(ch)[0] in 'LN' for ch in value) for value in ids)
         and len(set(ids)) == len(ids), 'publication-consumer-identifiers')
    return {'schema': 'helmut-local-unit-native-publication-read-probe/1',
            'commandHash': selection['commandHash'], 'knowledgeObjectIds': ids}


def _publication_read_report(command, selection, report):
    probe = _publication_probe(command, selection)
    need(type(report) is dict and set(report) == {'schema', 'observed', 'probeCanonicalSHA256', 'knowledgeObjectCount', 'documentIdentityCount', 'requestCount'}
         and report['schema'] == 'helmut-local-unit-native-publication-read/1' and report['observed'] is True
         and report['probeCanonicalSHA256'] == sha(canonical(probe))
         and type(report['knowledgeObjectCount']) is int and report['knowledgeObjectCount'] == len(probe['knowledgeObjectIds'])
         and type(report['documentIdentityCount']) is int and 0 <= report['documentIdentityCount'] < 20000
         and type(report['requestCount']) is int and 0 < report['requestCount'] <= 9007199254740991,
         'genuine-publication-read-report')
    return probe


def _native_readback(worker, database, sources, oid, original_relations):
    expected = _json_sql(sources)
    sql = """DO $native_sources$ BEGIN
IF (SELECT jsonb_object_agg(n.nspname||'.'||p.proname||'('||oidvectortypes(p.proargtypes)||')',
 encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='helmut_unit_diagnostic' OR n.nspname='public' AND p.proname LIKE 'local_unit_diagnostic_%_v1')
 IS DISTINCT FROM @SOURCES@ THEN RAISE EXCEPTION 'execution-native-source-drift';END IF;
END;$native_sources$;
SET SESSION AUTHORIZATION helmut_ud_authenticator_@SUFFIX@;SET ROLE helmut_ud_runtime_@SUFFIX@;
DO $contract$ BEGIN PERFORM set_config('helmut.execution_contract',public.local_unit_diagnostic_contract_v1()::text,true);END;$contract$;
RESET ROLE;RESET SESSION AUTHORIZATION;
SELECT jsonb_build_object('contract',current_setting('helmut.execution_contract')::jsonb,
'originalRelations',helmut_unit_diagnostic.original_bridge_relations_v1());""".replace('@SOURCES@', expected).replace('@SUFFIX@', database[-32:])
    value = _call(worker, database, _readonly(database, sql), 'EXECUTION_FRESH_NATIVE_CONTRACT')
    need(type(value) is dict and set(value) == {'contract', 'originalRelations'} and value['originalRelations'] == original_relations, 'fresh-original-relations')
    contract = value['contract']
    need(type(contract) is dict and set(contract) == {'version', 'database', 'databaseOID', 'sources', 'legacyReadRPCs', 'sourceQualified'}
         and contract['version'] == 'helmut-local-unit-diagnostic-native-store/1' and contract['database'] == database
         and contract['databaseOID'] == oid and contract['sources'] == sources and contract['sourceQualified'] is False
         and len(contract['legacyReadRPCs']) == 2, 'fresh-native-contract')
    return contract


def _initial_usage(worker, database, nonce):
    keys = ['localUnitDiagnosticConsumedGrantsV1'] + ['localUnitDiagnostic:' + nonce + ':' + k for k in
            ('journal', 'costs', 'reservation', 'sendClaim', 'review', 'result')]
    sql = """SELECT jsonb_build_object('usage',public.helmut_auth_usage_checked_proof_local_v1('main-auth'),
'authority',(SELECT count(*) FROM helmut_unit_diagnostic.authority),'state',(SELECT count(*) FROM helmut_unit_diagnostic.state),
'artifacts',(SELECT count(*) FROM helmut_unit_diagnostic.artifacts),'leases',(SELECT count(*) FROM helmut_unit_diagnostic.leases),
'observations',(SELECT count(*) FROM helmut_unit_diagnostic.runtime_observations),
'ownKeys',(SELECT count(*) FROM public.helmut_store t CROSS JOIN LATERAL jsonb_object_keys(
helmut_unit_diagnostic.original_bridge_top_map_v1('main-auth',t.data#>>'{_authStateRef,generation}',t.data#>>'{_authStateRef,root}')) k
WHERE t.id='main-auth' AND k IN(SELECT jsonb_array_elements_text(@KEYS@))));""".replace('@KEYS@', _json_sql(keys))
    value = _call(worker, database, _readonly(database, sql), 'EXECUTION_INITIAL_USAGE_AND_EMPTY_SCOPE')
    need(type(value) is dict and set(value) == {'usage', 'authority', 'state', 'artifacts', 'leases', 'observations', 'ownKeys'}
         and all(type(value[k]) is int and value[k] == 0 for k in value if k != 'usage'), 'unseeded-original-copy')
    proof = value['usage']
    need(type(proof) is dict and set(proof) == {'proof', 'revision'} and set(proof['proof']) == {'generation', 'count', 'head', 'originalHash'}, 'actual-usage-baseline')
    return proof


def _confirmed_seed(worker, database, selection, initialization, initial_usage, own_hash):
    a, o = initialization['authority'], initialization['observation']
    # Evaluate the full data in SQL; return only actual tip and state metadata.
    payload = {'authority': a, 'observation': o, 'initialState': initialization['initialState'], 'initialUsage': initial_usage,
               'operationId': selection['operationId'], 'commandHash': selection['commandHash'], 'ownHash': own_hash}
    encoded = base64.b64encode(canonical(payload).encode()).decode()
    authority_dto = ','.join(_q(key) + ',saved_authority.' + column for key, column in (
        ('grantId', 'grant_id'), ('commandCanonical', 'command_canonical'), ('admissionCanonical', 'admission_canonical'),
        ('admissionHash', 'admission_hash'), ('sourceHash', 'source_hash'), ('targetHash', 'target_hash'), ('postrunHash', 'postrun_hash'),
        ('sourceProofHash', 'source_proof_hash'), ('codeManifestPin', 'code_manifest_pin'), ('runtimeManifestPin', 'runtime_manifest_pin'),
        ('gateHashes', 'gate_hashes'), ('verifierCodeHash', 'verifier_code_hash'), ('requestModels', 'request_models')))
    authority_dto += ", 'verifiedAtUTC',to_char(saved_authority.verified_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'),'expiresAtUTC',to_char(saved_authority.expires_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"')"
    sql = """DO $seed_confirm$ DECLARE input_value jsonb:=convert_from(decode('@INPUT@','base64'),'UTF8')::jsonb;
saved_state helmut_unit_diagnostic.state%rowtype; saved_observation helmut_unit_diagnostic.runtime_observations%rowtype;
saved_authority helmut_unit_diagnostic.authority%rowtype; auth_row jsonb;
BEGIN
SELECT * INTO STRICT saved_state FROM helmut_unit_diagnostic.state WHERE scope_hash=input_value->>'commandHash';
SELECT * INTO STRICT saved_authority FROM helmut_unit_diagnostic.authority WHERE scope_hash=input_value->>'commandHash';
SELECT * INTO STRICT saved_observation FROM helmut_unit_diagnostic.runtime_observations WHERE scope_hash=input_value->>'commandHash';
SELECT data INTO STRICT auth_row FROM public.helmut_store WHERE id='main-auth';
IF (SELECT count(*) FROM helmut_unit_diagnostic.authority)<>1 OR (SELECT count(*) FROM helmut_unit_diagnostic.state)<>1
OR (SELECT count(*) FROM helmut_unit_diagnostic.runtime_observations)<>1 OR EXISTS(SELECT FROM helmut_unit_diagnostic.artifacts)
OR EXISTS(SELECT FROM helmut_unit_diagnostic.leases) OR saved_state.revision<>0 OR saved_state.body_hash IS DISTINCT FROM input_value->>'ownHash'
OR saved_state.body IS DISTINCT FROM input_value->'initialState' OR saved_state.canonical_text::jsonb IS DISTINCT FROM saved_state.body
OR encode(sha256(convert_to(saved_state.canonical_text,'UTF8')),'hex') IS DISTINCT FROM saved_state.body_hash
OR saved_authority.operation_id IS DISTINCT FROM input_value->>'operationId'
OR saved_authority.command_canonical IS DISTINCT FROM input_value#>>'{authority,commandCanonical}'
OR saved_authority.source_proof_hash IS DISTINCT FROM input_value#>>'{authority,sourceProofHash}'
OR saved_authority.verifier_code_hash IS DISTINCT FROM input_value#>>'{authority,verifierCodeHash}'
OR jsonb_build_object(@AUTHORITY@) IS DISTINCT FROM input_value->'authority'
OR saved_observation.proof_canonical IS DISTINCT FROM input_value#>>'{observation,proofCanonical}'
OR saved_observation.proof_hash IS DISTINCT FROM input_value#>>'{observation,proofHash}'
OR encode(sha256(convert_to(saved_observation.proof_canonical,'UTF8')),'hex') IS DISTINCT FROM saved_observation.proof_hash
OR saved_observation.observed_at IS DISTINCT FROM (input_value#>>'{observation,observedAtUTC}')::timestamptz
OR public.helmut_auth_usage_checked_proof_local_v1('main-auth')->'proof' IS DISTINCT FROM input_value#>'{initialUsage,proof}'
OR helmut_unit_diagnostic.original_bridge_own_projection_v1('main-auth',auth_row#>>'{_authStateRef,generation}',
auth_row#>>'{_authStateRef,root}',input_value->>'operationId') IS DISTINCT FROM saved_state.body
THEN RAISE EXCEPTION 'execution-seed-readback';END IF;
PERFORM helmut_unit_diagnostic.validate_state(input_value->>'commandHash',saved_state.body);
END;$seed_confirm$;
SELECT jsonb_build_object('ordinal',r.ordinal,'proofHash',r.proof_hash,'observedAtUTC',
to_char(r.observed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) FROM helmut_unit_diagnostic.runtime_observations r
WHERE r.scope_hash=@SCOPE@;""".replace('@INPUT@', encoded).replace('@SCOPE@', _q(selection['commandHash'])).replace('@AUTHORITY@', authority_dto)
    tip = _call(worker, database, _readonly(database, sql), 'EXECUTION_CONFIRMED_SEED_READBACK')
    need(type(tip) is dict and set(tip) == {'ordinal', 'proofHash', 'observedAtUTC'} and type(tip['ordinal']) is int and tip['ordinal'] > 0
         and tip['proofHash'] == o['proofHash'] and tip['observedAtUTC'] == o['observedAtUTC'], 'confirmed-seed-tip')
    return tip


class _HostVerifier:
    def __init__(self, controller):
        self.c = controller

    def verify(self, *, observed_at_utc, sample_started_ns, baseline_hash):
        c = self.c
        need(time.monotonic_ns() - sample_started_ns <= 15_000_000_000
             and re.fullmatch('[a-f0-9]{64}', baseline_hash), 'observation-host-budget')
        c.observer.check(); c.service.poll()
        c.host_observation(c.host.call('HOST_OBSERVE', {}, seconds=3))
        c.immutable_check()
        need(time.monotonic_ns() - sample_started_ns <= 15_000_000_000, 'observation-host-return-budget')


def _claim_only_snapshot(worker, database, selection, command, initialization, initial_usage, terminal, close):
    need(terminal['schema']=='helmut-local-unit-native-claim-only-terminal/1' and terminal['status']=='diagnosed'
         and terminal['selection']==selection and terminal['errors']==[]
         and terminal['unit60OrAuth30Acceptance']=='CLAIM_ONLY_NOT_UNIT_OR_AUTH_ACCEPTANCE'
         and all(terminal[k] is False for k in ('full500Accepted','independentFinalAcceptance','production','paidProviderCallsAllowed','retryAllowed')),
         'claim-only-terminal')
    r=terminal['result']
    need(r['mode']=='fresh-claim-only-v1' and r['claimCallbackReached'] is True and type(r['callbackCalls']) is int and r['callbackCalls']==1
         and r['claimStillRunning'] is True and r['authorityConsumed'] is True
         and all(type(r[k]) is int and r[k]==0 for k in ('motorCalls','providerCalls','completedUnits','expectedPositions','controlCount'))
         and all(r[k] is False for k in ('unit60Qualified','auth30Qualified','independentFinalAcceptance','full500Accepted','production','paidProviderCallsAllowed','retryAllowed'))
         and all(r[k]==selection[k] for k in selection),'claim-only-summary')
    need(close['selection']==selection and close['process']==terminal['process'] and type(close['exitCode']) is int and close['exitCode']==0
         and close['signal'] is None and close['stdoutEOF'] is True and close['stderrEOF'] is True
         and close['terminalCanonicalSHA256']==sha(canonical(terminal)),'claim-only-actual-close')
    payload={'selection':selection,'commandCanonical':canonical(command),'initialState':initialization['initialState'],
             'initialUsage':initial_usage,'terminal':terminal}
    sql="""SET LOCAL helmut.local_diagnostic_scope='bounded-cas-qualification-v1';
DO $claim_diagnostic$
DECLARE arg jsonb:=@INPUT@;a helmut_unit_diagnostic.authority%rowtype;s helmut_unit_diagnostic.state%rowtype;
 k text;j jsonb;old_j jsonb;expected_j jsonb;auth_row jsonb;proof jsonb;entered timestamptz;claimed timestamptz;deadline timestamptz;
BEGIN
 SELECT * INTO STRICT a FROM helmut_unit_diagnostic.authority WHERE scope_hash=arg#>>'{selection,commandHash}';
 SELECT * INTO STRICT s FROM helmut_unit_diagnostic.state WHERE scope_hash=a.scope_hash;
 IF a.operation_id IS DISTINCT FROM arg#>>'{selection,operationId}' OR a.command_canonical IS DISTINCT FROM arg->>'commandCanonical'
  OR encode(sha256(convert_to(a.command_canonical,'UTF8')),'hex') IS DISTINCT FROM a.scope_hash
  OR (SELECT count(*) FROM helmut_unit_diagnostic.authority)<>1 OR (SELECT count(*) FROM helmut_unit_diagnostic.state)<>1
  OR s.revision<>1 OR s.body IS DISTINCT FROM s.canonical_text::jsonb
  OR encode(sha256(convert_to(s.canonical_text,'UTF8')),'hex') IS DISTINCT FROM s.body_hash
  OR EXISTS(SELECT FROM helmut_unit_diagnostic.artifacts) OR EXISTS(SELECT FROM helmut_unit_diagnostic.leases)
  THEN RAISE EXCEPTION 'claim-diagnostic-fresh-one-claim-state';END IF;
 k:='localUnitDiagnostic:'||right(a.operation_id,32)||':';j:=s.body->(k||'journal');old_j:=(arg->'initialState')->(k||'journal');
 IF old_j->>'state' IS DISTINCT FROM 'installed' OR old_j->'claimId' IS DISTINCT FROM 'null'::jsonb
  OR old_j->'inFlight' IS DISTINCT FROM 'null'::jsonb OR old_j->'index' IS DISTINCT FROM '0'::jsonb
  OR j->>'state' IS DISTINCT FROM 'running' OR jsonb_typeof(j->'claimId') IS DISTINCT FROM 'string'
  OR (j->>'claimId' ~ '^[a-f0-9-]{36}$') IS DISTINCT FROM true
  OR j->'index' IS DISTINCT FROM '0'::jsonb OR j#>'{inFlight,index}' IS DISTINCT FROM '0'::jsonb
  OR j->'attempts' IS DISTINCT FROM '{}'::jsonb OR j->'stopRequested' IS DISTINCT FROM 'false'::jsonb
  OR j->'reason' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'claim-diagnostic-running-only';END IF;
 expected_j:=old_j||jsonb_build_object('state','running','claimId',j->'claimId','claimedAtUTC',j->'claimedAtUTC','inFlight',j->'inFlight');
 IF j IS DISTINCT FROM expected_j OR (s.body-(k||'journal')) IS DISTINCT FROM ((arg->'initialState')-(k||'journal'))
  THEN RAISE EXCEPTION 'claim-diagnostic-outside-first-claim-drift';END IF;
 entered:=helmut_unit_diagnostic.utc(j#>'{inFlight,enteredAtUTC}');claimed:=helmut_unit_diagnostic.utc(j->'claimedAtUTC');
 deadline:=helmut_unit_diagnostic.utc(j#>'{inFlight,deadlineAtUTC}');
 IF entered<helmut_unit_diagnostic.utc(arg#>'{terminal,startedAtUTC}') OR claimed<entered OR claimed>=entered+interval '30 seconds'
  OR deadline IS DISTINCT FROM least(entered+interval '60 seconds',helmut_unit_diagnostic.utc(a.command_canonical::jsonb#>'{calendar,endsAtUTC}'))
  OR helmut_unit_diagnostic.utc(arg#>'{terminal,finishedAtUTC}')<claimed
  OR helmut_unit_diagnostic.utc(arg#>'{terminal,finishedAtUTC}')>=deadline
  THEN RAISE EXCEPTION 'claim-diagnostic-time-binding';END IF;
 PERFORM helmut_unit_diagnostic.validate_state(a.scope_hash,s.body);
 SELECT data INTO STRICT auth_row FROM public.helmut_store WHERE id='main-auth';
 PERFORM public.helmut_auth_state_assert_graph_local_v1('main-auth',auth_row#>>'{_authStateRef,generation}',auth_row#>>'{_authStateRef,root}');
 IF helmut_unit_diagnostic.original_bridge_own_projection_v1('main-auth',auth_row#>>'{_authStateRef,generation}',auth_row#>>'{_authStateRef,root}',a.operation_id)
  IS DISTINCT FROM s.body THEN RAISE EXCEPTION 'claim-diagnostic-original-own-mismatch';END IF;
 proof:=public.helmut_auth_usage_checked_proof_local_v1('main-auth')->'proof';
 IF proof IS DISTINCT FROM arg#>'{initialUsage,proof}' THEN RAISE EXCEPTION 'claim-diagnostic-usage-changed';END IF;
 PERFORM set_config('helmut.claim_only_snapshot',jsonb_build_object('schema','helmut-native-claim-only-snapshot/1',
  'operationId',a.operation_id,'commandHash',a.scope_hash,'ownRevision',s.revision,'ownHash',s.body_hash,
  'claimIdSHA256',encode(sha256(convert_to(j->>'claimId','UTF8')),'hex'),'journalState',j->>'state',
  'usageUnchanged',true,'artifacts',0,'claimStillRunning',true,'authorityConsumed',true,'unitAccepted',false)::text,true);
END;$claim_diagnostic$;
SELECT current_setting('helmut.claim_only_snapshot')::jsonb;""".replace('@INPUT@',_json_sql(payload))
    statement=_readonly(database,sql).replace('BEGIN READ ONLY;','BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;',1)
    value=_call(worker,database,statement,'CLAIM_ONLY_READONLY_SNAPSHOT')
    need(type(value) is dict and set(value)=={'schema','operationId','commandHash','ownRevision','ownHash','claimIdSHA256',
                                             'journalState','usageUnchanged','artifacts','claimStillRunning','authorityConsumed','unitAccepted'}
         and value['schema']=='helmut-native-claim-only-snapshot/1'
         and all(value[k]==selection[k] for k in selection) and type(value['ownRevision']) is int and value['ownRevision']==1
         and all(type(value[k]) is str and re.fullmatch('[a-f0-9]{64}',value[k]) for k in ('ownHash','claimIdSHA256'))
         and value['journalState']=='running' and value['usageUnchanged'] is True and type(value['artifacts']) is int and value['artifacts']==0
         and value['claimStillRunning'] is True and value['authorityConsumed'] is True and value['unitAccepted'] is False,
         'claim-only-readonly-snapshot')
    return value


class _Controller:
    def __init__(self, worker, config, pg, catalog, preparation, read_result, bridge_result):
        self.w, self.c, self.pg, self.catalog, self.preparation = worker, config, pg, catalog, preparation
        self.read, self.bridge = read_result, bridge_result
        self.source = worker.load('execution_source_support', config['executionSourcePin'])
        self.observer_module = worker.load('execution_source_observer', config['sourceObserverPin'])
        self.updater = worker.load('execution_observation_updater', config['observationUpdaterPin'])
        self.final = worker.load('execution_final_acceptance', config['finalAcceptancePin'])
        self.query_pin = worker.pin(BIN / 'local-unit-native-worker.py')
        self.updater._callable(worker.query, self.query_pin, name='query')
        need(worker.pin(__file__) == config['executionControllerPin'], 'controller-code-pin')
        self.built = preparation['prepared']; self.command = self.built['command']; self.selection = self.built['selection']
        self.database, self.expires = config['database'], self.command['calendar']['endsAtUTC']
        need(config.get('nativeDiagnosticMode') in (None,'fresh-claim-only-v1','readonly-http-pre-admission-v1'),'exact-native-diagnostic-mode')
        self.claim_only=config.get('nativeDiagnosticMode')=='fresh-claim-only-v1'
        self.readonly_http=config.get('nativeDiagnosticMode')=='readonly-http-pre-admission-v1'
        need(config.get('executeNativeSingleUnit') is True and config.get('full500') is False
             and str(worker.OUT) == '/bench' and os.getuid() == os.geteuid() == 1000
             and config.get('motorCalls') == config.get('paidProviderCalls') == 0
             and self.selection == {'operationId': 'localUnitDiagnostic-' + config['nonce'], 'commandHash': sha(canonical(self.command))}
             and self.database == catalog['database'] == self.command['target']['database'] == 'helmut_unit_diagnostic_' + config['nonce']
             and canonical(self.command) == preparation['canonical'], 'explicit-own-unit')
        self.host = self.source.HostChannel(worker, config, self.selection)
        self.service, self.observer, self.host_ready, self.stage_number = None, None, None, 0
        self.immutable = []

    def stage(self, name):
        self.stage_number += 1
        self.w.save('EXECUTION_STAGE_%02d.SAFE.json' % self.stage_number,
                    {'schema': 'helmut-local-unit-native-execution-stage/1', 'stage': name,
                     'selection': self.selection, 'observedAtUTC': utc()})

    def private(self, name, expected=None, cap=8 * 1024**2):
        return self.source.private_json(self.w, self.w.OUT / name, expected=expected, cap=cap)

    def physical(self, pin):
        prefix = '/workspace/helmut-unit-diagnostic-native/' + self.c['nonce'] + '/'
        if pin['path'].startswith(prefix):
            name = pin['path'][len(prefix):]
            need('/' not in name and name not in ('', '.', '..', 'PREPARED_COMMAND.PRIVATE.json'), 'client-immutable-name')
            return {**pin, 'path': str(self.w.OUT / 'client' / name)}
        return dict(pin)

    def host_physical(self, pin):
        """Translate only our client artifacts across the Source bind mount.

        Source reads /bench/client; the Host independently opens the same files
        at its newly owned case/client directory. Original file pins never move.
        """
        physical = self.physical(pin)
        prefix = '/workspace/helmut-unit-diagnostic-native/' + self.c['nonce'] + '/'
        if pin['path'].startswith(prefix):
            name = pin['path'][len(prefix):]
            need(physical['path'] == '/bench/client/' + name, 'host-client-source-path')
            physical['path'] = prefix + 'client/' + name
        return physical

    def files(self):
        reservation = self.built['initialState']['localUnitDiagnostic:' + self.c['nonce'] + ':reservation']
        code_pin = {'path': '/workspace/helmut-unit-diagnostic-native/' + self.c['nonce'] + '/CODE_MANIFEST.SAFE.json',
                    **{k: v for k, v in self.w.pin(self.w.OUT / 'client/CODE_MANIFEST.SAFE.json').items() if k != 'path'}}
        # The admission stores only the runtime hash; its exact logical path is
        # fixed by the native authority trigger and measured manifest consumer.
        actual_runtime = self.w.pin(self.w.OUT / 'client/RUNTIME_MANIFEST.SAFE.json')
        runtime_pin = {**actual_runtime, 'path': '/workspace/helmut-unit-diagnostic-native/' + self.c['nonce'] + '/RUNTIME_MANIFEST.SAFE.json'}
        code, _ = self.source.private_json(self.w, self.physical(code_pin)['path'], expected=self.physical(code_pin))
        runtime, _ = self.source.private_json(self.w, actual_runtime['path'], expected=actual_runtime)
        need(set(code) == {'schema', 'files'} and code['schema'] == 'helmut-local-unit-diagnostic-code-manifest/1'
             and set(runtime) == {'schema', 'database', 'sqlSources', 'files', 'transport'}
             and runtime['schema'] == 'helmut-local-unit-diagnostic-runtime-manifest/1' and runtime['database'] == self.database
             and runtime_pin['sha256'] == self.command['slot']['plan']['runtimeManifestHash']
             and len(runtime['sqlSources']) == 36 and runtime['sqlSources'] == self.bridge['actualContractSources']
             and self.c['executionControllerPin'] in code['files'] and self.query_pin in code['files'], 'actual-execution-manifests')
        need(reservation['command'] == self.command and reservation['admission'] == self.built['admission'], 'installed-command-admission')
        rows = {}
        for pin in [code_pin, runtime_pin] + code['files'] + runtime['files'] + list(self.command['gatePins'].values()):
            need(pin['path'] not in rows or rows[pin['path']]['logical'] == pin, 'conflicting-closure')
            physical = self.physical(pin); need(self.w.pin(physical['path']) == physical, 'manifest-file-pin')
            rows[pin['path']] = {'logical': pin, 'physical': physical}
        return code_pin, runtime_pin, code, runtime, list(rows.values())

    def immutable_check(self):
        self.w.guard(self.c)
        for path, identity in self.immutable:
            p = Path(path)
            need(p.resolve() == p and tuple(getattr(p.lstat(), k) for k in META) == identity, 'immutable-source-drift')

    def host_observation(self, value):
        need(type(value) is dict and set(value) == {'observedAtUTC', 'source', 'sourceService', 'sourceContainerId', 'knownContainerIds', 'ownerObservation'}
             and value['sourceContainerId'] == self.c['actualSourceContainerId']
             and value['sourceContainerId'] in value['knownContainerIds'], 'actual-host-source')
        now = self.source.parse_utc(utc())
        need(0 <= (now - self.source.parse_utc(value['observedAtUTC'])).total_seconds() < 3, 'fresh-host-observation')
        heartbeat = value['ownerObservation']
        need(type(heartbeat) is dict and heartbeat['schema'] == 'helmut-local-unit-native-owner-observation/1'
             and heartbeat['operationId'] == self.selection['operationId'] and heartbeat['commandHash'] == self.selection['commandHash']
             and 0 <= (now - self.source.parse_utc(heartbeat['observedAtUTC'])).total_seconds() <= 15, 'fresh-owner-heartbeat')
        for key in ('owner', 'upstream'):
            process = heartbeat[key]
            need(process['uids'] == process['gids'] == [0, 0, 0, 0] and process['capabilitiesZero'] is True
                 and process['noNewPrivileges'] is True and process['membership'] == '0::/\n'
                 and process['pidNamespace'] == self.observer.binding['pidNamespace'], 'actual-owner-process')
        if self.host_ready:
            need(heartbeat['owner']['pid'] == self.host_ready['ownerPID'] and heartbeat['owner']['startTicks'] == self.host_ready['ownerStartTicks']
                 and heartbeat['upstream']['pid'] == self.host_ready['upstreamPID'] and heartbeat['upstream']['startTicks'] == self.host_ready['upstreamStartTicks'], 'owner-heartbeat-identity')
        # A process outside the host's private cgroup namespace is rendered by
        # this kernel as /../<parent>/<CID>. The trusted Host independently
        # binds the actual parent inode and cgroup.procs; retain its exact view
        # and accept only this Source CID, never normalize arbitrary traversal.
        source_groups = {'0::/' + prefix + self.c['parent'] + '/' + leaf + '\n'
                         for prefix in ('', '../')
                         for leaf in (self.c['actualSourceContainerId'], 'docker-' + self.c['actualSourceContainerId'] + '.scope')}
        need(value['source']['namespacePID'] == os.getpid() and value['source']['startTicks'] == self.observer.supervisor['startTicks']
             and value['source']['namespaces']['pid'] == self.observer.binding['pidNamespace']
             and value['source']['membership'] in source_groups, 'host-source-pid-map')
        service = value['sourceService']
        need(service['namespacePID'] == self.observer.service['pid'] and service['startTicks'] == self.observer.service['startTicks']
             and service['exe'] == self.c['nodePin']['path'] and service['membership'] == value['source']['membership']
             and service['namespaces']['pid'] == value['source']['namespaces']['pid'], 'host-service-pid-map')
        self.last_host = value
        return value

    def start_owner(self, service_config, service_pin, code, runtime, files):
        self.service = self.source.NodeChild(self.w, self.c, 'scripts/helmut-resource-meter/local-unit-original-service.js', '--serve-original-writes', 'ORIGINAL_SERVICE')
        ready = self.service.first_line()
        self.observer = self.observer_module.SourceServiceObserver(self.service.child, ready, service_pin, self.c['nodePin'],
                                                                 self.c['actualSourceContainerId'], self.source.source_group(self.c))
        q = self.observer.qualification()
        aliases = {key: self.w.pin(name) for key, name in (('owner', '/opt/local-unit-native-owner.js'), ('broker', '/opt/local-unit-diagnostic-broker.js'), ('postgrest', '/opt/postgrest-pinned'))}
        need(aliases == self.c['executionHostPlan']['aliasPins'], 'actual-owner-alias-pins')
        shutdown_sources = _shutdown_policy_sources(self.w, self.c['executionHostPlan'])
        authenticator = self.c['executionAuthenticator']
        need(set(authenticator) == {'username', 'passwordHex', 'jwtSecretHex'} and authenticator['username'] == self.read['authenticatorUsername'], 'actual-installed-authenticator')
        qraw = json.dumps(q, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode()
        start = {'schema': 'helmut-local-unit-native-owner-start/2', 'mode': 'owner-local-no500', **self.selection,
                 'database': self.database, 'issuedAtUTC': utc(), 'expiresAtUTC': self.expires, 'measuredCgroup': self.source.source_group(self.c),
                 'pins': {**aliases, 'node': self.c['nodePin']}, 'authenticator': authenticator, 'postgrestPort': 3000,
                 'shutdownPolicySources': shutdown_sources, 'legacy': self.read['legacy'], 'originalService': {'hmacKeyPath': '/run/bootstrap/ORIGINAL_HMAC.PRIVATE.bin',
                     'sourceQualificationPin': {'path': '/run/bootstrap/SOURCE_QUALIFICATION.PRIVATE.json', 'bytes': len(qraw), 'sha256': sha(qraw)},
                     'publicSourceBinding': q['publicSourceBinding']}}
        # Include only public/fixture immutables, never prepared initial state or
        # seed/config/authority objects. Host checks the exact RO mount closure.
        self.w.save('client/SELECTION.SAFE.json', self.selection)
        selection_pin = {**self.w.pin(self.w.OUT / 'client/SELECTION.SAFE.json'),
                         'path': '/workspace/helmut-unit-diagnostic-native/' + self.c['nonce'] + '/SELECTION.SAFE.json'}
        pins = list(self.command['gatePins'].values()) + [self.code_pin, self.runtime_pin, self.built['admission']['authorizationPin'], selection_pin]
        pins += [self.command['target'][k] for k in ('postrunPin', 'ownerEvidencePin', 'runtimeEvidencePin', 'sourceRuntimePin')]
        pins += list(self.preparation['originalPins'].values())
        pins += [p for phase in self.preparation['ready']['derivedPins'].values() for p in phase.values()]
        transport = runtime['transport']; pins += list(transport['originalPins'].values())
        unique = {p['path']: p for p in pins}
        handoff = {'start': start, 'sourceQualification': q, 'hmacKeyHex': service_config['secretHex'],
                   'readQualifications': [{'path': row['pin']['path'], 'text': row['text']} for row in self.read['qualificationFiles']],
                   'immutableClientPins': [{'logical': p, 'physical': self.host_physical(p)} for p in unique.values()],
                   'publicationPolicy': (self.w.OUT / 'PUBLICATION_POLICY.PRIVATE.json').read_bytes().decode('utf8')}
        response = self.host.call('OWNER_START', {'handoff': handoff})
        need(set(response) == {'ready', 'observation'} and response['ready']['schema'] == 'helmut-local-unit-native-owner-ready/2'
             and response['ready']['originalService'] == self.observer.binding, 'actual-owner-ready')
        self.host_ready = response['ready']; self.host_observation(response['observation'])
        self.qualify_client(runtime)

    def qualify_client(self, runtime):
        qualifier = {'schema': 'helmut-local-unit-native-endpoint-qualification-config/1', 'selection': self.selection,
                     'database': self.database, 'databaseOID': self.catalog['databaseOID'], 'sqlSources': runtime['sqlSources'],
                     'publicSourceBinding': self.observer.binding, 'codePins': self.c['sourceCodePins'], 'nodePin': self.c['nodePin'],
                     'issuedAtUTC': utc(), 'expiresAtUTC': self.expires, 'measuredCgroup': self.source.source_group(self.c),
                     'publicationProbe': _publication_probe(self.command, self.selection)}
        result = self.host.call('CLIENT_QUALIFY', {'configuration': qualifier}, seconds=40)
        need(set(result) == ({'processClose', 'reportPin', 'report', 'phaseCapture'} if self.readonly_http else
                             {'processClose', 'reportPin', 'report'}), 'client-qualification-result')
        close, report = result['processClose'], result['report']
        need(close['exitCode'] == 0 and close['stdoutNaturalEOF'] is True and close['stderrNaturalEOF'] is True
             and report['schema'] == 'helmut-local-unit-native-endpoint-qualification/1' and report['selection'] == self.selection
             and report['databaseOID'] == self.catalog['databaseOID'] and report['signedReadonlyContractObserved'] is True
             and report['sqlSourcesCanonicalSHA256'] == sha(canonical(runtime['sqlSources']))
             and report['publicSourceBindingCanonicalSHA256'] == sha(canonical(self.observer.binding))
             and report['seedPerformed'] is False and report['scopeClaimConsumed'] is False, 'actual-client-contract')
        _publication_read_report(self.command, self.selection, report.get('publicationRead'))
        if self.readonly_http:
            self.client_phase_capture = self.readonly_phase_capture(result['phaseCapture'], close, 'ENDPOINT', close['clientContainerId'])
        self.client_report = report
        self.w.save('CLIENT_QUALIFICATION.PRIVATE.json', result)

    def readonly_phase_capture(self, capture, close, name, container_id):
        filename = 'READONLY_HTTP_' + name + '_PHASES.PRIVATE.log'
        path = '/workspace/helmut-unit-diagnostic-native/' + self.c['nonce'] + '/' + filename
        need(set(capture) == {'pin', 'processClose', 'containerId'} and capture['containerId'] == container_id
             and type(container_id) is str and re.fullmatch('[0-9a-f]{64}', container_id)
             and capture['processClose'] == {k: close[k] for k in ('exitCode', 'stdoutNaturalEOF', 'stderrNaturalEOF', 'registeredHostPID')}
             and close['exitCode'] == 0 and close['stdoutNaturalEOF'] is True and close['stderrNaturalEOF'] is True
             and set(capture['pin']) == {'path', 'bytes', 'sha256'} and capture['pin']['path'] == path
             and type(capture['pin']['bytes']) is int and 0 <= capture['pin']['bytes'] <= 128 * 1024
             and {**self.w.pin(self.w.OUT / filename), 'path': path} == capture['pin'], 'readonly-http-phase-capture')
        return capture

    def verify_source(self, prepared_pin):
        old, _ = self.private('PREPARE_CONFIG.PRIVATE.json')
        need(old['nonce'] == self.c['nonce'] and old['database'] == self.database and old['runId'] == self.preparation['ready']['runId']
             and old['originalPins'] == self.preparation['originalPins'] and old['nodePin'] == self.c['nodePin'], 'preparation-config-scope')
        expected = {'schema': 'helmut-local-unit-native-source-verify-expected/1', **self.selection,
                    'authorizedAtUTC': self.built['admission']['authorizedAtUTC'], 'preparedCommandPin': prepared_pin,
                    'sourceProofHash': sha(canonical(self.built['sourceBinding'])),
                    **{k: self.preparation['ready'][k] for k in ('selectionHash', 'selectedProfileHash', 'selectedSourcesHash',
                        'originalControlHash', 'producerProofHash', 'producerTransport', 'derivedPins')}}
        expected_pin = _compact(self.w, 'VERIFY_EXPECTED.PRIVATE.json', expected)
        verify_config = {**old, 'schema': 'helmut-local-unit-native-source-verify/1', 'issuedAtUTC': utc(), 'expiresAtUTC': self.expires,
                         'postgres': self.source.postgres_identity(self.w, self.pg), 'expectedPin': expected_pin}
        config_pin = _compact(self.w, 'VERIFY_CONFIG.PRIVATE.json', verify_config)
        child = self.source.NodeChild(self.w, self.c, 'scripts/helmut-resource-meter/local-unit-native-prepare.js', '--verify-own-native-source', 'SOURCE_VERIFICATION')
        output = child.finish(seconds=45)
        _node_closed(child)
        need(output == b'', 'verification-no-extra-output')
        result, result_pin = self.private('SOURCE_VERIFICATION.SAFE.json', cap=65536)
        need(result['schema'] == 'helmut-local-unit-native-source-verification/1' and result['configPin'] == config_pin
             and result['nonce'] == self.c['nonce'] and result['runId'] == old['runId'] and result['database'] == self.database
             and result['expectedPin'] == expected_pin and result['preparedCommandPin'] == prepared_pin
             and all(result[k] == expected[k] for k in expected if k != 'schema')
             and result['process']['pid'] == child.process['pid'] and result['process']['startTicks'] == child.process['startTicks']
             and result['process']['exe'] == child.process['exe'], 'actual-source-verification')
        self.observer_module.node_budget(result['actualNodeBudget'])
        need(0 <= (self.source.parse_utc(utc()) - self.source.parse_utc(result['checkedAtUTC'])).total_seconds() <= 3, 'source-verification-freshness')
        self.w.save('SOURCE_VERIFICATION_PROCESS.PRIVATE.json', {'process': child.process, 'resultPin': result_pin, 'exitCode': child.child.returncode,
                    'stdoutEOF': child.eof[0], 'stderrEOF': child.eof[1]})
        return result

    def source_authority(self, verification, code, runtime):
        need(not self.readonly_http, 'readonly-http-no-admission')
        self.host_observation(self.host.call('HOST_OBSERVE', {}, seconds=3)); self.observer.check(); self.immutable_check()
        _native_readback(self.w, self.database, runtime['sqlSources'], self.catalog['databaseOID'], self.bridge['qualification']['originalRelations'])
        self.native_catalog = _call(self.w, self.database, self.updater.observation_catalog_sql(), 'EXECUTION_PRIVATE_POST_BRIDGE_CATALOG')
        expected_originals = {p['name'] + '(' + p['identityArguments'] + ')': p['prosrcSHA256'] for p in self.bridge['qualification']['originalSources']}
        actual = {p['signature']: p['sha256'] for p in self.native_catalog['functions']}
        need(self.native_catalog['databaseOID'] == self.catalog['databaseOID'] and all(actual.get(k) == v for k, v in expected_originals.items()), 'fresh-original-catalog')
        self.w.save('EXECUTION_NATIVE_CATALOG.PRIVATE.json', self.native_catalog)
        originals = {k: self.preparation['originalPins'][k] for k in ('preparedRequests', 'actualRequestBindings', 'providerFixtures')}
        transport = runtime['transport']
        need(set(transport) == {'schema', 'originalPins', 'phases'}
             and transport['schema'] == 'helmut-local-unit-diagnostic-source-producer-transport/1'
             and transport['originalPins'] == originals and set(transport['phases']) == {'D', 'R'}, 'genuine-producer-transport')
        producer = self.w.pin(Path(self.c['repository']) / 'lib/helmut/local-unit-diagnostic-original-producer.js')
        need(producer in code['files'], 'measured-producer-code')
        for phase in ('D', 'R'):
            row, pins = transport['phases'][phase], verification['derivedPins'][phase]
            need(set(row) == {'sourceIntentId', 'requestPin', 'derivedResponsePin', 'derivedLatencyPin', 'responseStatus', 'latencyMs', 'derivation'}
                 and row['sourceIntentId'] == verification['producerTransport']['sourceIntentIds'][phase]
                 and row['requestPin'] == pins['request'] and row['derivedResponsePin'] == pins['response'] and row['derivedLatencyPin'] == pins['latency']
                 and self.command['requestPins'][phase] == {k: pins['request'][k] for k in ('bytes', 'sha256')}
                 and row['responseStatus'] == verification['producerTransport']['phases'][phase]['responseStatus']
                 and row['latencyMs'] == verification['producerTransport']['phases'][phase]['latencyMs'], 'producer-phase-command-pins')
            need(row['derivation'] == {'schema': 'helmut-local-unit-diagnostic-pure-producer-derivation/1', 'producerPin': producer,
                 'inputPins': list(originals.values()), 'originalPinsHash': sha(canonical(originals)), 'requestSHA256': pins['request']['sha256'],
                 'responseSHA256': pins['response']['sha256'], 'latencySHA256': pins['latency']['sha256']}, 'producer-derivation')
        for gate in GATES:
            pin = self.command['gatePins'][gate]
            value, _ = self.source.private_json(self.w, self.physical(pin)['path'], expected=self.physical(pin))
            need(value['gate'] == gate and value['database'] == self.database and value['nonce'] == self.c['nonce']
                 and value['sourceIndex'] == 499 and value['diagnosticUnit'] == 0
                 and value['originalControlHash'] == verification['originalControlHash']
                 and value['sourceSelectionHash'] == verification['selectionHash']
                 and value['sourceProfileHash'] == verification['selectedProfileHash']
                 and value['sourceInputsHash'] == verification['selectedSourcesHash'], 'genuine-gate-preconditions')
        now = utc(); admission = self.built['admission']
        need(self.source.parse_utc(self.command['calendar']['startsAtUTC']) <= self.source.parse_utc(now) < self.source.parse_utc(self.expires)
             and admission['expiresAtUTC'] == self.expires and admission['commandHash'] == self.selection['commandHash']
             and self.command['limits']['unitMs'] == 60000 and self.command['limits']['authMs'] == 30000
             and self.command['limits']['controlsPerUnit'] == 16 and self.command['limits']['production'] is False
             and self.command['limits']['paidProviderCallsAllowed'] is False, 'actual-calendar-limits')
        self.initial_usage = _initial_usage(self.w, self.database, self.c['nonce'])
        self.w.save('INITIAL_USAGE_PROOF.PRIVATE.json', self.initial_usage)
        # These values are created only here, after real source/owner/client/SQL
        # checks. Future gate documents never supply a caller's authority flag.
        authority = {'grantId': admission['grantId'], 'commandCanonical': self.preparation['canonical'],
                     'admissionCanonical': canonical(admission), 'admissionHash': sha(canonical(admission)),
                     'sourceHash': sha(canonical(self.command['source'])), 'targetHash': sha(canonical(self.command['target'])),
                     'postrunHash': self.c['raw']['sha256'], 'sourceProofHash': verification['sourceProofHash'],
                     'codeManifestPin': self.code_pin, 'runtimeManifestPin': self.runtime_pin,
                     'gateHashes': {k: p['sha256'] for k, p in self.command['gatePins'].items()},
                     'verifierCodeHash': self.c['executionControllerPin']['sha256'], 'requestModels': {}, 'verifiedAtUTC': utc(), 'expiresAtUTC': self.expires}
        for phase in ('D', 'R'):
            pin = self.physical(verification['derivedPins'][phase]['request'])
            request, _ = self.source.private_json(self.w, pin['path'], expected=pin, cap=16 * 1024**2)
            need(request['model'] in ('gpt-5-mini', 'gpt-5-mini-eu'), 'actual-request-model'); authority['requestModels'][phase] = request['model']
        proof = {'operationId': self.selection['operationId'], 'commandHash': self.selection['commandHash'],
                 'sourceHash': authority['sourceHash'], 'targetHash': authority['targetHash'], 'postrunSHA256': authority['postrunHash'],
                 'gateHashes': authority['gateHashes'], 'codeManifestHash': self.code_pin['sha256'], 'runtimeManifestHash': self.runtime_pin['sha256'],
                 'databaseOID': self.catalog['databaseOID'], 'observedAtUTC': utc()}
        return {'schema': 'helmut-local-unit-original-seed-initialization/1', 'initialState': self.built['initialState'], 'authority': authority,
                'observation': {'proofCanonical': canonical(proof), 'proofHash': sha(canonical(proof)), 'observedAtUTC': proof['observedAtUTC']}}

    def seed(self, initialization, service_pin):
        need(not self.readonly_http, 'readonly-http-no-seed')
        init_pin = _compact(self.w, 'ORIGINAL_SEED_INITIALIZATION.PRIVATE.json', initialization)
        repo = Path(self.c['repository'])
        config = {'schema': 'helmut-local-unit-original-seed/1', **self.selection, 'database': self.database,
                  'selfPin': self.w.pin(BIN / 'local-unit-original-seed.js'), 'nodePin': self.c['nodePin'],
                  'originalServiceConfigPin': service_pin, 'seedInitializationPin': init_pin,
                  'codePins': {key: self.w.pin(repo / 'lib/helmut' / (name + '.js')) for key, name in self.source.SEED_CODE.items()},
                  'readRPCPins': self.prepare_config['readRPCPins'], 'psqlPin': self.w.pin(self.w.PGBIN / 'psql'), 'libraryPath': self.w.LIBRARY_PATH,
                  'measuredCgroup': self.source.source_group(self.c), 'postgres': self.source.postgres_identity(self.w, self.pg)}
        _compact(self.w, 'ORIGINAL_SEED_CONFIG.PRIVATE.json', config)
        child = self.source.NodeChild(self.w, self.c, 'scripts/helmut-resource-meter/local-unit-original-seed.js', '--seed-own-native-copy', 'ORIGINAL_SEED')
        result = parse(child.finish(seconds=35))
        _node_closed(child)
        own_hash = sha(canonical(initialization['initialState']))
        need(result['schema'] == 'helmut-local-unit-original-seed-result/1' and result['nativeSeed'] is True
             and result['operationId'] == self.selection['operationId'] and result['commandHash'] == self.selection['commandHash']
             and result['ownHash'] == own_hash and result['revision'] == 0 and result['originalWrites'] == 1
             and result['oldHistoryPreserved'] is True and result['claimConsumed'] is False, 'genuine-seed-ack')
        self.observer.check(); self.host_observation(self.host.call('HOST_OBSERVE', {}, seconds=3))
        return _confirmed_seed(self.w, self.database, self.selection, initialization, self.initial_usage, own_hash)

    def service_close(self):
        output = self.service.finish(seconds=12, signal_child=True)
        _node_closed(self.service)
        need(output.count(b'\n') == 1, 'service-output-protocol')
        stop, _ = self.private('ORIGINAL_SERVICE_STOP.SAFE.json', cap=32768)
        need(stop['schema'] == 'helmut-local-unit-original-service-stop/1' and stop['operationId'] == self.selection['operationId']
             and stop['commandHash'] == self.selection['commandHash'] and stop['servicePID'] == self.service.process['pid']
             and stop['serviceStartTicks'] == self.service.process['startTicks'] and stop['cleanShutdown'] is True
             and stop['terminal'] is False and stop['serverClosed'] is True and stop['childrenEmpty'] is True and stop['ledgerComplete'] is True,
             'actual-service-stop')
        raw, pin, _ = _raw(self.w.OUT / 'ORIGINAL_SERVICE_CHILDREN.SAFE.jsonl', 256 * 1024)
        need(pin == stop['ledgerPin'] and raw.endswith(b'\n'), 'service-ledger-pin')
        rows = [parse(line) for line in raw.splitlines()]
        need(rows[0]['event'] == 'header' and rows[0]['servicePID'] == self.service.process['pid']
             and rows[0]['commandHash'] == self.selection['commandHash'] and len(rows) == stop['eventCount'], 'service-ledger-header')
        spawns, closes = {}, set()
        for row in rows[1:]:
            index = row['index']
            if row['event'] == 'spawn':
                need(index not in spawns, 'duplicate-service-child'); spawns[index] = row
            else:
                need(row['event'] == 'close' and index in spawns and index not in closes
                     and row['pid'] == spawns[index]['process']['pid'] and row['startTicks'] == spawns[index]['process']['startTicks']
                     and row['requestNonceSHA256'] == spawns[index]['requestNonceSHA256']
                     and row['exitObserved'] is True and row['exitCode'] == 0 and row['exitSignal'] is None
                     and row['stdoutEOF'] is True and row['stderrEOF'] is True and row['failure'] is None and row['confirmed'] is True, 'service-child-unconfirmed')
                closes.add(index)
        need(len(spawns) == len(closes) == stop['spawnCount'] == stop['closeCount'] == stop['confirmedCount'], 'service-child-pairs')
        self.w.save('SERVICE_PROCESS_CLOSE.PRIVATE.json', {'process': self.service.process, 'exitCode': self.service.child.returncode,
                    'stdoutEOF': self.service.eof[0], 'stderrEOF': self.service.eof[1], 'ledgerPin': pin})

    def stop_owner(self):
        self.stage('owner-trace-close'); owner = self.host.call('OWNER_STOP', {}, seconds=15)
        need(owner['ownerStop']['cleanShutdown'] is True and owner['ownerStop']['failed'] is False
             and owner['ownerProcessClose']['exitCode'] == 0 and owner['ownerProcessClose']['stdoutNaturalEOF'] is True
             and owner['ownerProcessClose']['stderrNaturalEOF'] is True, 'actual-owner-stop')
        trace = owner['controlReadTrace']; header = trace['value']['header']
        identity = trace['identity']
        need(trace['pin']['path'] == '/run/bootstrap/CONTROL_READ_TRACE.SAFE.jsonl' and set(identity) == set(META)
             and identity['st_uid'] == identity['st_gid'] == 0 and identity['st_nlink'] == 1
             and stat.S_ISREG(identity['st_mode']) and stat.S_IMODE(identity['st_mode']) == 0o600
             and identity['st_size'] == trace['pin']['bytes']
             and header['operationId'] == self.selection['operationId'] and header['commandHash'] == self.selection['commandHash']
             and header['ownerPID'] == self.host_ready['ownerPID'] and header['ownerStartTicks'] == self.host_ready['ownerStartTicks']
             and header['pidNamespace'] == self.observer.binding['pidNamespace']
             and header['timeNamespace'] == self.last_host['source']['namespaces']['time']
             and header['clockDomain'] == self.last_host['source']['namespaces']['clockDomain']
             and header['brokerCodeSHA256'] == self.host_ready['brokerCodePin']['sha256']
             and header['sourceBindingSHA256'] == sha(canonical(self.observer.binding))
             and header['trustSHA256'] == self.client_report['rootTrustSHA256'] and trace['value']['footer']['complete'] is True, 'actual-root-trace')
        return owner

    def readonly_http_finish(self):
        need(self.readonly_http and not self.claim_only, 'readonly-http-mode')
        owner = self.stop_owner()
        captures = {'endpoint': self.client_phase_capture,
                    'broker': self.readonly_phase_capture(owner['phaseCapture'], owner['ownerProcessClose'], 'BROKER', self.observer.binding['containerId'])}
        self.observer.check(); self.immutable_check()
        self.stage('source-service-close'); self.service_close(); self.immutable_check()
        stop, stop_pin = self.private('ORIGINAL_SERVICE_STOP.SAFE.json', cap=32768)
        need(all(type(stop[k]) is int and stop[k] == 0 for k in ('spawnCount', 'closeCount', 'confirmedCount')),
             'readonly-http-no-original-writes')
        report = self.client_report
        need(report['signedReadonlyContractObserved'] is True and report['seedPerformed'] is False
             and report['scopeClaimConsumed'] is False, 'readonly-http-client-contract')
        self.w.save('READONLY_HTTP_DIAGNOSTIC.PRIVATE.json', {
            'schema': 'helmut-native-readonly-http-diagnostic/1', 'selection': self.selection,
            'client': report, 'owner': owner, 'sourceServiceStopPin': stop_pin, 'phaseCaptures': captures,
            'admissionPerformed': False, 'seedPerformed': False, 'scopeClaimConsumed': False})
        return {'schema': 'helmut-local-unit-native-readonly-http-result/1',
                'diagnosticMode': 'readonly-http-pre-admission-v1', 'selection': self.selection,
                'genuineSourceInputsQualified': True, 'readClosureQualified': True, 'originalBridgeQualified': True,
                'readonlyHttpObserved': True, 'signedReadonlyContractObserved': True, 'publicationReadObserved': True,
                'phaseCaptures': captures,
                'executionAuthorityInstalled': False, 'admissionPerformed': False, 'seedPerformed': False,
                'scopeClaimConsumed': False, 'runtimeReadMeasured': False, 'ownStateReadMeasured': False,
                'unit60Qualified': False, 'auth30Qualified': False, 'independentFinalAcceptance': False,
                'motorCalls': 0, 'actualEntryCalls': 0, 'providerCalls': 0, 'completedUnits': 0,
                'expectedPositions': 0, 'controlCount': 0, 'full500': False, 'production': False}

    def run(self):
        self.stage('source-private-command')
        prepared_pin = _move_prepared(self.w, self.preparation)
        self.prepare_config, _ = self.private('PREPARE_CONFIG.PRIVATE.json')
        self.code_pin, self.runtime_pin, code, runtime, files = self.files()
        for pin in [self.c['raw'], *self.preparation['originalPins'].values(), *code['files'], *runtime['files']]:
            physical = self.physical(pin); need(self.w.pin(physical['path']) == physical, 'fresh-input-runtime-pin')
            s = Path(physical['path']).lstat(); self.immutable.append((physical['path'], tuple(getattr(s, k) for k in META)))
        s = Path(prepared_pin['path']).lstat()
        self.immutable.append((prepared_pin['path'], tuple(getattr(s, k) for k in META)))
        service_config = {'schema': 'helmut-local-unit-original-service/1', **self.selection, 'database': self.database,
                          'issuedAtUTC': utc(), 'expiresAtUTC': self.expires, 'measuredCgroup': self.source.source_group(self.c),
                          'postgres': self.source.postgres_identity(self.w, self.pg), 'psqlPin': self.w.pin(self.w.PGBIN / 'psql'),
                          'servicePin': self.w.pin(BIN / 'local-unit-original-service.js'),
                          'transactionCodePin': self.w.pin(BIN / 'local-unit-original-transaction.js'), 'secretHex': os.urandom(32).hex(),
                          'qualification': self.bridge['qualification'], 'libraryPath': self.w.LIBRARY_PATH}
        service_pin = _compact(self.w, 'ORIGINAL_SERVICE_CONFIG.PRIVATE.json', service_config)
        self.stage('owner-and-client-observation'); self.start_owner(service_config, service_pin, code, runtime, files)
        _publication_read_report(self.command, self.selection, self.client_report.get('publicationRead'))
        if self.readonly_http:
            return self.readonly_http_finish()
        self.stage('genuine-source-reconstruction'); verification = self.verify_source(prepared_pin)
        self.stage('fresh-source-admission'); initialization = self.source_authority(verification, code, runtime)
        self.stage('private-original-seed'); tip = self.seed(initialization, service_pin)
        directory = self.w.OUT / 'observations'; directory.mkdir(mode=0o700)
        baseline = {'schema': 'helmut-local-unit-observation-baseline/1', 'database': self.database, 'databaseOID': self.catalog['databaseOID'],
                    **self.selection, 'authority': initialization['authority'], 'initialTip': tip, 'sourceBinding': self.observer.binding,
                    'pins': {'observer': self.c['sourceObserverPin'], 'hostVerifier': self.c['executionControllerPin'], 'query': self.query_pin},
                    'files': files, 'catalog': self.native_catalog, 'attemptDirectory': str(directory), 'hostVerifierFunction': '_HostVerifier.verify'}
        self.w.save('OBSERVATION_BASELINE.PRIVATE.json', baseline)
        host_verifier = _HostVerifier(self)
        def append():
            nonlocal tip
            started = time.monotonic_ns()
            result = self.updater.append_observation(self.w.query, baseline=baseline, source_observer=self.observer,
                         verify_host_and_closure=host_verifier.verify, expected_previous=tip)
            need(time.monotonic_ns() - started <= 15_000_000_000, 'complete-durable-observation-span')
            tip = result['tip']
            return started / 1_000_000_000
        # No background callback races the serial HostChannel. ENTRY_RESULT is
        # requested only after terminal publication, while periodic samples run.
        last_sample = append()
        self.stage('entry-once'); self.host_observation(self.host.call('HOST_OBSERVE', {}, seconds=3))
        _compact(self.w, 'CLAIM_ONLY_ENTRY_REQUESTED.SAFE.json' if self.claim_only else 'MOTOR_ENTRY_REQUESTED.SAFE.json',
                 {'schema':'helmut-local-unit-native-claim-only-entry-request/1' if self.claim_only else 'helmut-local-unit-native-motor-entry-request/1',
                  'selection':self.selection,'requestedAtUTC':utc()})
        entry_body={'diagnosticMode':'fresh-claim-only-v1'} if self.claim_only else {}
        self.host.call('ENTRY_START', entry_body, seconds=5)
        until = time.monotonic() + 70
        terminal_path = self.w.OUT / 'client/ATTEMPT_TERMINAL.SAFE.json'
        exit_ready = self.w.OUT / 'client/ENTRY_OBSERVATION_EXIT_READY.SAFE.json.PUBLISHED'
        # The CLI publishes this atomic directory only after its terminal has
        # been durably written. File existence alone can expose a partial JSON.
        while not exit_ready.exists():
            self.observer.check(); self.service.poll(); self.immutable_check()
            need(time.monotonic() < until and utc() < self.expires, 'entry-terminal-deadline')
            if time.monotonic() - last_sample >= 8:
                last_sample = append()
            time.sleep(.025)
        entry = self.host.call('ENTRY_RESULT', entry_body, seconds=8)
        terminal, terminal_pin = self.private('client/ATTEMPT_TERMINAL.SAFE.json', cap=1024**2)
        need(set(entry) == {'processClose', 'actualEntryProcessClose', 'terminalPin', 'terminal'} and entry['terminal'] == terminal
             and entry['terminalPin']['bytes'] == terminal_pin['bytes'] and entry['terminalPin']['sha256'] == terminal_pin['sha256'], 'actual-entry-result')
        owner = self.stop_owner()
        trace = owner['controlReadTrace']
        self.observer.check(); self.immutable_check()
        if self.claim_only:
            self.stage('claim-only-readonly-snapshot')
            snapshot=_claim_only_snapshot(self.w,self.database,self.selection,self.command,initialization,self.initial_usage,terminal,entry['actualEntryProcessClose'])
            self.stage('source-service-close');self.service_close();self.immutable_check()
            self.w.save('CLAIM_ONLY_DIAGNOSTIC.PRIVATE.json',{'schema':'helmut-native-claim-only-diagnostic/1',
                        'snapshot':snapshot,'entry':entry,'owner':owner,'reuseForbidden':True})
            return {'schema':'helmut-local-unit-native-claim-only-result/1','diagnosticMode':'fresh-claim-only-v1','selection':self.selection,
                    'genuineSourceInputsQualified':True,'readClosureQualified':True,'originalBridgeQualified':True,
                    'executionAuthorityInstalled':True,'claimOnlyObserved':True,'claimStillRunning':True,'authorityConsumed':True,
                    'unit60Qualified':False,'auth30Qualified':False,'independentFinalAcceptance':False,'independentProductAcceptance':False,
                    'motorCalls':0,'actualEntryCalls':1,'providerCalls':0,'completedUnits':0,'expectedPositions':0,'controlCount':0,
                    'full500':False,'production':False,'originalAuthRowUnchanged':False,'copiedOriginalAuthRowUnchanged':False,
                    'originalRAWUnchanged':True,'reuseForbidden':True,'claimSnapshotSHA256':sha(canonical(snapshot))}
        self.stage('final-readonly-acceptance')
        acceptance = self.final.final_acceptance(self.w.query, command=self.command, expectedInitialUsageProof=self.initial_usage,
                        actualEntryTerminal=terminal, actualEntryProcessClose=entry['actualEntryProcessClose'], controlReadTrace=trace['value'])
        self.stage('source-service-close'); self.service_close()
        self.immutable_check()
        self.w.save('FINAL_ACCEPTANCE.PRIVATE.json', {'acceptance': acceptance, 'entry': entry, 'owner': owner})
        need(acceptance['nativeSingleUnitAccepted'] is True and acceptance['snapshot']['positionCount'] == 3
             and acceptance['snapshot']['controlCount'] == acceptance['snapshot']['freshGraphReadCount'] == 16
             and acceptance['snapshot']['ownArtifactCount'] == 9 and acceptance['snapshot']['originalResultRowCount'] == 7
             and terminal['result']['completedUnits'] == 1, 'independent-native-final-acceptance')
        return {'schema': 'helmut-local-unit-native-execution-result/1', 'selection': self.selection,
                'genuineSourceInputsQualified': True, 'readClosureQualified': True, 'originalBridgeQualified': True,
                'executionAuthorityInstalled': True, 'unit60Qualified': True, 'auth30Qualified': True,
                'independentFinalAcceptance': True, 'independentProductAcceptance': False,
                'motorCalls': 1, 'actualEntryCalls': 1, 'providerCalls': 0, 'completedUnits': 1,
                'expectedPositions': 3, 'controlCount': 16, 'full500': False, 'production': False,
                'originalAuthRowUnchanged': False, 'copiedOriginalAuthRowUnchanged': False, 'originalRAWUnchanged': True,
                'finalAcceptanceSHA256': sha(canonical(acceptance))}


def run_single_unit(worker, config, pg, catalog, preparation, read_result, bridge_result):
    """One fresh owned COPY; every exception is terminal and never retried."""
    nonce = config.get('nonce')
    need(type(nonce) is str and re.fullmatch('[a-f0-9]{32}', nonce) and nonce not in _attempted, 'once-only')
    _attempted.add(nonce)
    controller = None
    try:
        controller = _Controller(worker, config, pg, catalog, preparation, read_result, bridge_result)
        return controller.run()
    except BaseException as error:
        if controller is not None:
            controller.host.sealed = True
            # Keep the actual cause on SOURCE for bounded diagnosis. It must
            # never become a public receipt or a reason to repeat this claim.
            try:
                _compact(worker, 'EXECUTION_FAILURE.PRIVATE.json', {
                    'schema': 'helmut-local-unit-native-execution-failure/1',
                    'selection': controller.selection, 'stageNumber': controller.stage_number,
                    'exceptionType': type(error).__name__, 'privateTraceback': traceback.format_exc()[:32768],
                    'retryAllowed': False})
            except BaseException:
                pass
            # Shutdown is cleanup only. It cannot restore acceptance or reopen
            # an unknown write. The worker independently closes all PG children.
            if controller.service is not None:
                try:
                    controller.service.finish(seconds=12, signal_child=True)
                except BaseException:
                    pass
        raise ExecutionError('native-single-unit-execution-not-confirmed-no-retry') from None
