"""Independent, metadata-only acceptance of one completed local fixture unit.

The SOURCE controller must supply its actual pre-unit usage proof, observed
Entry terminal/process close and independent finished Broker trace. Their JSON
shape is not provenance. query(database, sql, label) must use the qualified COPY,
ON_ERROR_STOP, bounded private capture, actual exit0 and both natural EOFs. This
module has no process, socket, connection, write, retry or execution entry point.
It evaluates all result/history payloads inside ONE read-only snapshot. The old
usage claim covers logical record bodies/order, not unrelated physical columns.
"""
import base64
import datetime
import hashlib
import json
import math
import re


class FinalAcceptanceError(RuntimeError):
    pass


HASH = re.compile('[a-f0-9]{64}')
UUID = re.compile('[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}')
NS = re.compile('0|[1-9][0-9]{0,29}')
STAGES = ('unit-enter', 'before-D', 'reserve-D', 'send-D', 'D-accounted', 'before-R', 'D-retained',
          'reserve-R', 'send-R', 'R-accounted', 'R-retained', 'before-lage-save', 'after-lage-save',
          'before-briefing-materialize', 'before-morning-insert', 'before-evidence-retention')
KINDS = ('usage-D', 'usage-R', 'draft', 'immutable-D', 'review', 'lage', 'mandatsbriefing', 'morgenbriefing', 'evidence')
RESULT_FIELDS = {'state', 'operationId', 'commandHash', 'sourceIndex', 'diagnosticUnit', 'units', 'completedUnits',
                 'dispatchedUnits', 'expectedPositions', 'evidenceHash', 'independentFinalAcceptance', 'full500Accepted',
                 'production', 'paidProviderCallsAllowed', 'retryAllowed'}


def _need(ok, code):
    if not ok:
        raise FinalAcceptanceError('native-final-acceptance-' + code)


def _canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False)


def _sha(value):
    return hashlib.sha256(value.encode('utf8') if isinstance(value, str) else value).hexdigest()


def _parse(raw):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            _need(key not in result, 'duplicate-json-key')
            result[key] = value
        return result
    return json.loads(raw, object_pairs_hook=unique,
                      parse_constant=lambda _: (_ for _ in ()).throw(ValueError('nonfinite')))


def _hash(value):
    return type(value) is str and HASH.fullmatch(value) is not None


def _ns(value):
    return type(value) is str and NS.fullmatch(value) is not None


def _utc(value):
    _need(type(value) is str and re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z', value), 'utc')
    parsed = datetime.datetime.fromisoformat(value.replace('Z', '+00:00'))
    _need(parsed.isoformat(timespec='milliseconds').replace('+00:00', 'Z') == value, 'utc')
    return parsed


def _entry(terminal, close, selection):
    fields = {'schema', 'status', 'selection', 'attemptPin', 'process', 'startedAtUTC', 'finishedAtUTC', 'timing', 'result',
              'errors', 'memory', 'unit60OrAuth30Acceptance', 'full500Accepted', 'independentFinalAcceptance', 'production',
              'paidProviderCallsAllowed', 'retryAllowed'}
    _need(type(terminal) is dict and set(terminal) == fields and terminal['schema'] == 'helmut-local-unit-native-entry-terminal/1'
          and terminal['status'] == 'closed' and terminal['selection'] == selection and terminal['errors'] == []
          and terminal['unit60OrAuth30Acceptance'] == 'ADAPTER_AND_SQL_ONLY_NOT_ATTESTED_BY_ENTRY'
          and all(terminal[k] is False for k in ('full500Accepted', 'independentFinalAcceptance', 'production', 'paidProviderCallsAllowed', 'retryAllowed')), 'entry-terminal')
    result = terminal['result']
    _need(type(result) is dict and set(result) == RESULT_FIELDS and result['state'] == 'closed'
          and all(result[k] == selection[k] for k in selection) and _hash(result['evidenceHash'])
          and all(type(result[k]) is int and result[k] == v for k, v in {'sourceIndex': 499, 'diagnosticUnit': 0,
              'units': 1, 'completedUnits': 1, 'dispatchedUnits': 1, 'expectedPositions': 3}.items())
          and all(result[k] is False for k in ('independentFinalAcceptance', 'full500Accepted', 'production', 'paidProviderCallsAllowed', 'retryAllowed')), 'entry-result')
    process = terminal['process']
    _need(type(process) is dict and set(process) == {'pid', 'startTicks', 'nspid', 'pidNamespace', 'hostPIDMapping'}
          and type(process['pid']) is int and process['pid'] > 0 and _ns(process['startTicks']) and int(process['startTicks']) > 0
          and type(process['nspid']) is list and process['nspid'] and all(type(p) is int and p > 0 for p in process['nspid'])
          and process['nspid'][-1] == process['pid'] and re.fullmatch(r'pid:\[[1-9][0-9]*\]', process['pidNamespace'])
          and process['hostPIDMapping'] == 'NOT_ESTABLISHED_BY_ENTRY', 'entry-process')
    pin = terminal['attemptPin']
    case = '/workspace/helmut-unit-diagnostic-native/' + selection['operationId'][-32:] + '/'
    _need(type(pin) is dict and set(pin) == {'path', 'bytes', 'sha256'} and pin['path'] == case + 'ATTEMPT_STARTED.SAFE.json'
          and type(pin['bytes']) is int and 0 < pin['bytes'] <= 16384 and _hash(pin['sha256']), 'entry-first-attempt')
    timing = terminal['timing']
    _need(type(timing) is dict and set(timing) == {'totalMonotonicMS', 'adapterElapsedMS'}
          and all(type(timing[k]) in (int, float) and math.isfinite(timing[k]) and timing[k] >= 0 for k in timing)
          and timing['adapterElapsedMS'] < 60000 and timing['totalMonotonicMS'] >= timing['adapterElapsedMS'], 'entry-monotonic-unit60')
    _need(_utc(terminal['finishedAtUTC']) >= _utc(terminal['startedAtUTC']), 'entry-time')
    _need(type(close) is dict and set(close) == {'schema', 'selection', 'process', 'exitCode', 'signal', 'stdoutEOF', 'stderrEOF',
        'terminalCanonicalSHA256', 'observedAtUTC'} and close['schema'] == 'helmut-local-unit-native-entry-process-close/1'
        and close['selection'] == selection and close['process'] == process and type(close['exitCode']) is int and close['exitCode'] == 0
        and close['signal'] is None and close['stdoutEOF'] is True and close['stderrEOF'] is True
        and close['terminalCanonicalSHA256'] == _sha(_canonical(terminal))
        and _utc(close['observedAtUTC']) >= _utc(terminal['finishedAtUTC']), 'actual-entry-close')


def _inputs(command, initial, terminal, close, trace):
    _need(type(command) is dict and command.get('version') == 'helmut-local-unit-diagnostic-command/1'
          and command.get('mode') == 'D-R-1-local-fixture' and type(command.get('limits', {}).get('units')) is int and command['limits']['units'] == 1
          and command['limits'].get('production') is False and command['limits'].get('paidProviderCallsAllowed') is False
          and len(command.get('units', [])) == len(command.get('drafts', [])) == 1, 'command')
    operation = command['slot']['plan']['operationId']
    _need(type(operation) is str and re.fullmatch('localUnitDiagnostic-[a-f0-9]{32}', operation), 'operation')
    database = 'helmut_unit_diagnostic_' + operation[-32:]
    _need(command['target']['database'] == database, 'database')
    canonical = _canonical(command)
    _need(len(canonical.encode('utf8')) <= 16 * 1024**2, 'command-cap')
    selection = {'operationId': operation, 'commandHash': _sha(canonical)}
    _need(type(initial) is dict and set(initial) == {'proof', 'revision'} and type(initial['proof']) is dict
          and set(initial['proof']) == {'generation', 'count', 'head', 'originalHash'}
          and UUID.fullmatch(initial['proof']['generation']) and type(initial['proof']['count']) is int
          and 0 <= initial['proof']['count'] <= 10000000 and _hash(initial['proof']['head']) and _hash(initial['proof']['originalHash'])
          and type(initial['revision']) is str and UUID.fullmatch(initial['revision']), 'actual-initial-usage-proof')
    _entry(terminal, close, selection)
    _trace(trace, selection)
    return database, selection, {'commandCanonical': canonical, 'selection': selection, 'initial': initial,
                               'terminal': terminal, 'close': close, 'trace': trace}


def _trace(trace, selection):
    _need(type(trace) is dict and set(trace) == {'schema', 'header', 'records', 'footer'}
          and trace['schema'] == 'helmut-local-unit-native-control-read-trace/1', 'independent-control-trace')
    h = trace['header']
    _need(type(h) is dict and set(h) == {'operationId', 'commandHash', 'database', 'ownerPID', 'ownerStartTicks',
        'pidNamespace', 'timeNamespace', 'clockDomain', 'brokerCodeSHA256', 'trustSHA256', 'sourceBindingSHA256'}
        and all(h[k] == selection[k] for k in selection) and h['database'] == 'helmut_unit_diagnostic_' + selection['operationId'][-32:]
        and type(h['ownerPID']) is int and h['ownerPID'] > 0 and _ns(h['ownerStartTicks']) and int(h['ownerStartTicks']) > 0
        and re.fullmatch(r'pid:\[[1-9][0-9]*\]', h['pidNamespace'])
        and all(_hash(h[k]) for k in ('brokerCodeSHA256', 'trustSHA256', 'sourceBindingSHA256')), 'trace-header')
    domain = h['clockDomain']
    _need(type(domain) is dict and set(domain) == {'schema', 'kind', 'namespace', 'bootId'}
          and domain['schema'] == 'helmut-local-unit-monotonic-domain/1'
          and type(domain['bootId']) is str and UUID.fullmatch(domain['bootId'])
          and ((domain['kind'] == 'time-namespace' and type(domain['namespace']) is str
                and re.fullmatch(r'time:\[[1-9][0-9]*\]', domain['namespace']))
               or (domain['kind'] == 'kernel-without-time-namespaces' and domain['namespace'] is None))
          and h['timeNamespace'] == domain['namespace'], 'trace-clock-domain')
    # A root-private Broker FD and independent actual Host/CID observation must
    # establish this DTO's provenance and exact shared domain/boot. Missing
    # kernel time namespaces never remove the UTC or monotonic limits below.
    _need(type(trace['records']) is list and len(trace['records']) == 19, 'nineteen-actual-trace-records')
    nonce_hashes, graph_nonces, previous_ns, previous_at = set(), set(), 0, None
    for index, r in enumerate(trace['records']):
        kind = 'control-bundle-4' if index < 16 else 'final-own-ack' if index == 16 else 'closed-state-readback'
        _need(type(r) is dict and set(r) == {'seq', 'kind', 'requestNonceSHA256', 'requestBodySHA256', 'responseBodySHA256',
            'attestationSHA256', 'envelopeSHA256', 'signatureSHA256', 'status', 'timing', 'io', 'control', 'ownAck', 'readback'}
            and type(r['seq']) is int and r['seq'] == index + 1 and r['kind'] == kind and type(r['status']) is int and r['status'] == 200
            and all(_hash(r[k]) for k in ('requestNonceSHA256', 'requestBodySHA256', 'responseBodySHA256', 'attestationSHA256', 'envelopeSHA256', 'signatureSHA256'))
            and r['requestNonceSHA256'] not in nonce_hashes, 'trace-record')
        nonce_hashes.add(r['requestNonceSHA256'])
        t = r['timing']
        _need(type(t) is dict and set(t) == {'sendUTC', 'sendNs', 'upstreamEndUTC', 'upstreamEndNs', 'signedUTC', 'signedNs', 'finishUTC', 'finishNs'}
              and all(_ns(t[k + 'Ns']) for k in ('send', 'upstreamEnd', 'signed', 'finish')), 'trace-clock-shape')
        times = [_utc(t[k + 'UTC']) for k in ('send', 'upstreamEnd', 'signed', 'finish')]
        mono = [int(t[k + 'Ns']) for k in ('send', 'upstreamEnd', 'signed', 'finish')]
        _need(times == sorted(times) and mono == sorted(mono) and mono[0] >= previous_ns
              and (previous_at is None or times[0] >= previous_at), 'trace-natural-order')
        previous_ns, previous_at = mono[-1], times[-1]
        io = r['io']
        _need(type(io) is dict and set(io) == {'upstreamRequestFinish', 'upstreamResponseEnd', 'upstreamMessageComplete',
              'ownerSocketEnd', 'ownerSocketClose', 'downstreamFinish'} and io['downstreamFinish'] is True, 'trace-response-finish')
        if kind == 'final-own-ack':
            _need(all(io[k] is None for k in ('upstreamRequestFinish', 'upstreamResponseEnd', 'upstreamMessageComplete'))
                  and io['ownerSocketEnd'] is True and io['ownerSocketClose'] is True, 'trace-owner-eof')
        else:
            _need(all(io[k] is True for k in ('upstreamRequestFinish', 'upstreamResponseEnd', 'upstreamMessageComplete'))
                  and io['ownerSocketEnd'] is None and io['ownerSocketClose'] is None, 'trace-http-eof')
        if kind == 'control-bundle-4':
            control = r['control']
            _need(type(control) is dict and set(control) == {'readNonceSHA256','index','stage','claimHash','bundleNonceSHA256','graphComponent','ownHash','ownRevision'}
                  and all(_hash(control[k]) for k in ('readNonceSHA256','claimHash','bundleNonceSHA256','ownHash'))
                  and type(control['index']) is int and control['index'] == index
                  and control['stage'] == STAGES[index] and control['graphComponent'] == 'original'
                  and type(control['ownRevision']) is int and control['ownRevision'] >= 0
                  and control['readNonceSHA256'] not in graph_nonces and r['ownAck'] is None and r['readback'] is None, 'trace-fresh-graph-read')
            graph_nonces.add(control['readNonceSHA256'])
        elif kind == 'final-own-ack':
            ack = r['ownAck']
            _need(r['control'] is None and r['readback'] is None and type(ack) is dict
                  and set(ack) == {'version', 'scopeHash', 'hash', 'revision', 'claimHash', 'nonceSHA256', 'authorizationHash', 'controlsHash', 'controlCount'}
                  and ack['version'] == 'helmut-local-unit-diagnostic-state-ack/1' and ack['scopeHash'] == selection['commandHash']
                  and type(ack['revision']) is int and ack['revision'] > 0 and type(ack['controlCount']) is int and ack['controlCount'] == 16
                  and all(_hash(ack[k]) for k in ('hash', 'claimHash', 'nonceSHA256', 'authorizationHash', 'controlsHash')), 'actual-final-state-ack')
        else:
            back = r['readback']
            _need(r['control'] is None and r['ownAck'] is None and type(back) is dict
                  and set(back) == {'version', 'scopeHash', 'hash', 'revision', 'nonceSHA256', 'claimIdSHA256', 'journalState', 'journalIndex',
                      'journalInFlightNull', 'resultState', 'evidenceHash', 'authorizationHash', 'controlsHash', 'controlCount'}
                  and back['version'] == 'helmut-local-unit-diagnostic-state-witness/1' and back['scopeHash'] == selection['commandHash']
                  and back['journalState'] == 'closed' and type(back['journalIndex']) is int and back['journalIndex'] == 1
                  and back['journalInFlightNull'] is True and back['resultState'] == 'retained-unreviewed'
                  and type(back['revision']) is int and back['revision'] > 0 and type(back['controlCount']) is int and back['controlCount'] == 16
                  and all(_hash(back[k]) for k in ('hash', 'nonceSHA256', 'claimIdSHA256', 'evidenceHash', 'authorizationHash', 'controlsHash')), 'actual-closed-state-readback')
    ack = trace['records'][16]['ownAck']
    _need(all(r['control']['claimHash'] == ack['claimHash'] for r in trace['records'][:16])
          and len({r['control']['bundleNonceSHA256'] for r in trace['records'][:16]}) == 16, 'trace-bundle-claim-nonces')
    _need(int(trace['records'][-1]['timing']['finishNs']) - int(trace['records'][0]['timing']['sendNs']) < 60000000000, 'trace-unit-monotonic-span')
    _need(all(int(r['timing']['sendNs']) > int(trace['records'][i - 1]['timing']['finishNs']) for i, r in enumerate(trace['records']) if i >= 17), 'readback-after-ack')
    for r in trace['records'][17:]:
        back = r['readback']
        _need(all(back[k] == ack[k] for k in ('scopeHash', 'hash', 'revision', 'authorizationHash', 'controlsHash', 'controlCount'))
              and back['claimIdSHA256'] == ack['claimHash'], 'ack-readback-binding')
    footer = trace['footer']
    _need(type(footer) is dict and set(footer) == {'event', 'recordCount', 'controlCount', 'finalAckCount', 'closedReadbackCount', 'complete'}
          and footer['event'] == 'closed' and footer['complete'] is True
          and all(type(footer[k]) is int and footer[k] == v for k, v in {'recordCount': 19, 'controlCount': 16, 'finalAckCount': 1, 'closedReadbackCount': 2}.items()), 'trace-natural-close')


def _trace_sql():
    return """ack:=trace#>'{records,16,ownAck}';back:=trace#>'{records,18,readback}';
 ack_at:=helmut_unit_diagnostic.utc(trace#>'{records,16,timing,finishUTC}');
 back_at:=helmut_unit_diagnostic.utc(trace#>'{records,18,timing,finishUTC}');
 IF ack->>'hash' IS DISTINCT FROM own_state.body_hash OR (ack->>'revision')::bigint IS DISTINCT FROM own_state.revision
  OR ack->>'claimHash' IS DISTINCT FROM encode(sha256(convert_to(j->>'claimId','UTF8')),'hex')
  OR ack->>'authorizationHash' IS DISTINCT FROM j#>>'{verification,authorizationHash}'
  OR ack->>'controlsHash' IS DISTINCT FROM j#>>'{verification,controlsHash}'
  OR ack_at<closed_at OR ack_at>=deadline OR back_at<ack_at OR back_at>=deadline
  OR back_at>helmut_unit_diagnostic.utc(arg#>'{terminal,finishedAtUTC}')
  THEN RAISE EXCEPTION 'final-acceptance-real-ack-deadline-binding';END IF;
 FOR row_meta IN SELECT value FROM jsonb_array_elements(trace->'records') WITH ORDINALITY z(value,i) WHERE i IN(18,19) LOOP
  IF row_meta#>>'{readback,evidenceHash}' IS DISTINCT FROM result_value->>'evidenceHash'
   OR row_meta#>>'{readback,hash}' IS DISTINCT FROM own_state.body_hash
   OR (row_meta#>>'{readback,revision}')::bigint IS DISTINCT FROM own_state.revision
   OR helmut_unit_diagnostic.utc(row_meta#>'{timing,sendUTC}')<ack_at
   OR helmut_unit_diagnostic.utc(row_meta#>'{timing,finishUTC}')>=deadline THEN
   RAISE EXCEPTION 'final-acceptance-real-closed-readback';END IF;
 END LOOP;
 controls:=verification->'controls';
 FOR x IN SELECT value,ordinality FROM jsonb_array_elements(trace->'records') WITH ORDINALITY WHERE ordinality<=16 LOOP
  control:=controls->((x.ordinality-1)::integer);
  IF helmut_unit_diagnostic.utc(x.value#>'{timing,sendUTC}')<helmut_unit_diagnostic.utc(control->'startedAtUTC')
   OR helmut_unit_diagnostic.utc(x.value#>'{timing,finishUTC}')>helmut_unit_diagnostic.utc(control->'completedAtUTC')
   OR helmut_unit_diagnostic.utc(x.value#>'{timing,finishUTC}')>=deadline
   THEN RAISE EXCEPTION 'final-acceptance-sixteen-live-control-read-windows';END IF;
  seen:=seen+1;
 END LOOP;
 IF seen<>16 OR helmut_unit_diagnostic.utc(controls#>'{15,completedAtUTC}')>closed_at
  OR helmut_unit_diagnostic.utc(verification#>'{authorization,startedAtUTC}') IS DISTINCT FROM entered
  THEN RAISE EXCEPTION 'final-acceptance-native-verification-order';END IF;"""


def _validate_summary(value, database, selection, arguments):
    fields = {'schema', 'selection', 'database', 'databaseOID', 'stateHash', 'stateRevision', 'evidenceHash', 'authorizationHash', 'controlsHash',
              'ownArtifactCount', 'originalResultRowCount', 'positionCount', 'controlCount', 'freshGraphReadCount', 'newUsageCount',
              'initialUsageCount', 'finalUsageCount', 'initialUsageHead', 'finalUsageHead', 'historicalLogicalPrefixUnchanged',
              'finalACKAndReadbackBound', 'snapshotAtUTC'}
    ack = arguments['trace']['records'][16]['ownAck']; initial = arguments['initial']['proof']
    _need(type(value) is dict and set(value) == fields and value['schema'] == 'helmut-local-unit-native-final-snapshot/1'
          and value['selection'] == selection and value['database'] == database and type(value['databaseOID']) is str
          and re.fullmatch('[1-9][0-9]{0,9}', value['databaseOID']) and int(value['databaseOID']) <= 4294967295
          and all(value[k] == ack[ack_key] for k, ack_key in {'stateHash': 'hash', 'stateRevision': 'revision',
              'authorizationHash': 'authorizationHash', 'controlsHash': 'controlsHash'}.items())
          and value['evidenceHash'] == arguments['terminal']['result']['evidenceHash']
          and all(type(value[k]) is int and value[k] == n for k, n in {'stateRevision': ack['revision'], 'ownArtifactCount': 9,
              'originalResultRowCount': 7, 'positionCount': 3, 'controlCount': 16, 'freshGraphReadCount': 16, 'newUsageCount': 2,
              'initialUsageCount': initial['count'], 'finalUsageCount': initial['count'] + 2}.items())
          and value['initialUsageHead'] == initial['head'] and _hash(value['finalUsageHead'])
          and value['historicalLogicalPrefixUnchanged'] is True and value['finalACKAndReadbackBound'] is True
          and _utc(value['snapshotAtUTC']) >= _utc(arguments['close']['observedAtUTC']), 'actual-final-snapshot')


def _sql(arguments):
    encoded = base64.b64encode(_canonical(arguments).encode('utf8')).decode('ascii')
    return """BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL standard_conforming_strings=on;SET LOCAL search_path=pg_catalog;SET LOCAL timezone='UTC';
SET LOCAL statement_timeout='25s';SET LOCAL lock_timeout='500ms';SET LOCAL helmut.local_usage_experiment='on';
DO $final$
DECLARE arg jsonb:=convert_from(decode('@INPUT@','base64'),'UTF8')::jsonb; c jsonb; selection jsonb; trace jsonb;
 initial jsonb; p jsonb; final_proof jsonb; auth_data jsonb; own_state helmut_unit_diagnostic.state%rowtype;
 a helmut_unit_diagnostic.authority%rowtype; k text; j jsonb; result_value jsonb; evidence jsonb; verification jsonb;
 phase text; art helmut_unit_diagnostic.artifacts%rowtype; u public.llm_usage%rowtype; d_head text; prefix_head text;
 phase_index integer:=0; n0 bigint; x record; row_meta jsonb; controls jsonb; control jsonb; seen integer:=0;
 entered timestamptz; deadline timestamptz; closed_at timestamptz; ack_at timestamptz; back_at timestamptz;
 ack jsonb; back jsonb; final_meta jsonb; count_artifacts integer; hash_key text;
BEGIN
 c:=(arg->>'commandCanonical')::jsonb;selection:=arg->'selection';trace:=arg->'trace';initial:=arg->'initial';p:=initial->'proof';
 IF current_database() IS DISTINCT FROM c#>>'{target,database}' OR session_user<>'postgres' OR current_user<>session_user
  OR NOT EXISTS(SELECT FROM pg_roles WHERE rolname='postgres' AND rolsuper)
  OR current_setting('server_version_num')::integer NOT BETWEEN 170000 AND 179999
  OR current_setting('server_encoding')<>'UTF8' OR current_setting('client_encoding')<>'UTF8'
  OR current_setting('transaction_read_only')<>'on' OR current_setting('transaction_isolation')<>'repeatable read'
  THEN RAISE EXCEPTION 'final-acceptance-owned-readonly-snapshot';END IF;
 SELECT * INTO STRICT a FROM helmut_unit_diagnostic.authority WHERE scope_hash=selection->>'commandHash';
 IF a.operation_id IS DISTINCT FROM selection->>'operationId' OR a.command_canonical IS DISTINCT FROM arg->>'commandCanonical'
  OR encode(sha256(convert_to(a.command_canonical,'UTF8')),'hex') IS DISTINCT FROM selection->>'commandHash'
  THEN RAISE EXCEPTION 'final-acceptance-command';END IF;
 k:='localUnitDiagnostic:'||right(a.operation_id,32)||':';
 SELECT * INTO STRICT own_state FROM helmut_unit_diagnostic.state WHERE scope_hash=a.scope_hash;
 IF own_state.body IS DISTINCT FROM own_state.canonical_text::jsonb
  OR encode(sha256(convert_to(own_state.canonical_text,'UTF8')),'hex') IS DISTINCT FROM own_state.body_hash
  THEN RAISE EXCEPTION 'final-acceptance-state-bytes';END IF;
 j:=own_state.body->(k||'journal');result_value:=own_state.body->(k||'result');
 IF j->>'state' IS DISTINCT FROM 'closed' OR j->'index' IS DISTINCT FROM '1'::jsonb OR j->'inFlight' IS DISTINCT FROM 'null'::jsonb
  OR j->'stopRequested' IS DISTINCT FROM 'false'::jsonb OR j->'reason' IS DISTINCT FROM 'null'::jsonb
  OR j#>>'{attempts,D,status}' IS DISTINCT FROM 'accounted' OR j#>>'{attempts,R,status}' IS DISTINCT FROM 'accounted'
  OR result_value->>'state' IS DISTINCT FROM 'retained-unreviewed'
  OR result_value->>'evidenceHash' IS DISTINCT FROM arg#>>'{terminal,result,evidenceHash}'
  THEN RAISE EXCEPTION 'final-acceptance-explicit-closed';END IF;
 PERFORM helmut_unit_diagnostic.validate_state(a.scope_hash,own_state.body);
 PERFORM helmut_unit_diagnostic.original_bridge_result_v1(a.scope_hash,own_state.body);
 SELECT count(*) INTO count_artifacts FROM helmut_unit_diagnostic.artifacts WHERE scope_hash=a.scope_hash;
 IF count_artifacts<>9 OR (SELECT array_agg(kind ORDER BY kind COLLATE "C") FROM helmut_unit_diagnostic.artifacts WHERE scope_hash=a.scope_hash)
  IS DISTINCT FROM ARRAY['draft','evidence','immutable-D','lage','mandatsbriefing','morgenbriefing','review','usage-D','usage-R']::text[]
  OR EXISTS(SELECT FROM helmut_unit_diagnostic.artifacts t WHERE t.scope_hash=a.scope_hash
   AND (t.owner_id IS DISTINCT FROM c#>>'{units,0,subject}' OR t.body IS DISTINCT FROM t.canonical_text::jsonb
    OR encode(sha256(convert_to(t.canonical_text,'UTF8')),'hex') IS DISTINCT FROM t.body_hash))
  THEN RAISE EXCEPTION 'final-acceptance-nine-artifacts';END IF;
 SELECT body INTO STRICT evidence FROM helmut_unit_diagnostic.artifacts WHERE scope_hash=a.scope_hash AND kind='evidence';
 IF evidence?'failure' OR evidence->>'enteredAtUTC' IS DISTINCT FROM evidence#>>'{verification,authorization,startedAtUTC}'
  THEN RAISE EXCEPTION 'final-acceptance-success-verification';END IF;
 entered:=helmut_unit_diagnostic.utc(evidence->'enteredAtUTC');deadline:=helmut_unit_diagnostic.utc(evidence->'deadlineAtUTC');
 closed_at:=helmut_unit_diagnostic.utc(j->'closedAtUTC');
 IF deadline IS DISTINCT FROM least(entered+interval '60 seconds',helmut_unit_diagnostic.utc(c#>'{calendar,endsAtUTC}'))
  OR entered<helmut_unit_diagnostic.utc(c#>'{calendar,startsAtUTC}') OR entered<helmut_unit_diagnostic.utc(arg#>'{terminal,startedAtUTC}')
  OR closed_at<entered OR closed_at>=deadline OR closed_at>helmut_unit_diagnostic.utc(arg#>'{terminal,finishedAtUTC}')
  THEN RAISE EXCEPTION 'final-acceptance-unit60-calendar';END IF;
 verification:=evidence->'verification';PERFORM helmut_unit_diagnostic.verify_controls(verification,a.scope_hash,j->>'claimId');
 @TRACE_CHECKS@
 -- Native verify_controls implements the same ordered UTC/Ns/shape checks as
 -- A.validateVerification. Add its exact hash JSON types and <=now constraints.
 IF helmut_unit_diagnostic.utc(verification#>'{authorization,confirmedAtUTC}')>back_at
  OR jsonb_typeof(verification#>'{authorization,commandHash}') IS DISTINCT FROM 'string'
  OR jsonb_typeof(verification#>'{authorization,claimId}') IS DISTINCT FROM 'string'
  THEN RAISE EXCEPTION 'final-acceptance-auth-future';END IF;
 FOR control IN SELECT value FROM jsonb_array_elements(verification->'controls') LOOP
  FOREACH hash_key IN ARRAY ARRAY['runtimeHash','inputsHash','profileHash','bindingHash','stateHash','costsHash'] LOOP
   IF jsonb_typeof(control->hash_key) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'final-acceptance-verification-hash-types';END IF;
  END LOOP;
  IF jsonb_typeof(control->'commandHash') IS DISTINCT FROM 'string'
   OR (control->'artifactHash'<>'null'::jsonb AND jsonb_typeof(control->'artifactHash') IS DISTINCT FROM 'string')
   OR helmut_unit_diagnostic.utc(control->'completedAtUTC')>back_at THEN RAISE EXCEPTION 'final-acceptance-controls-future';END IF;
  IF NOT EXISTS(SELECT FROM helmut_unit_diagnostic.runtime_observations r WHERE r.scope_hash=a.scope_hash
   AND r.proof_hash=control->>'runtimeHash' AND encode(sha256(convert_to(r.proof_canonical,'UTF8')),'hex')=r.proof_hash
   AND r.proof_canonical::jsonb->>'operationId'=a.operation_id AND r.proof_canonical::jsonb->>'commandHash'=a.scope_hash
   AND r.proof_canonical::jsonb->>'sourceHash'=a.source_hash AND r.proof_canonical::jsonb->>'targetHash'=a.target_hash
   AND r.proof_canonical::jsonb->>'postrunSHA256'=a.postrun_hash AND r.proof_canonical::jsonb->'gateHashes'=a.gate_hashes
   AND r.proof_canonical::jsonb->>'codeManifestHash'=a.code_manifest_pin->>'sha256'
   AND r.proof_canonical::jsonb->>'runtimeManifestHash'=a.runtime_manifest_pin->>'sha256'
   AND r.proof_canonical::jsonb->>'databaseOID'=(SELECT oid::text FROM pg_database WHERE datname=current_database())
   AND helmut_unit_diagnostic.utc(r.proof_canonical::jsonb->'observedAtUTC')=r.observed_at
   AND r.observed_at>=helmut_unit_diagnostic.utc(control->'startedAtUTC')-interval '30 seconds'
   AND r.observed_at<=helmut_unit_diagnostic.utc(control->'completedAtUTC'))
   THEN RAISE EXCEPTION 'final-acceptance-actual-runtime-control-proof';END IF;
 END LOOP;
 n0:=(p->>'count')::bigint;
 final_proof:=public.helmut_auth_usage_checked_proof_local_v1('main-auth');
 IF final_proof#>>'{proof,generation}' IS DISTINCT FROM p->>'generation'
  OR final_proof#>>'{proof,originalHash}' IS DISTINCT FROM p->>'originalHash'
  OR (final_proof#>>'{proof,count}')::bigint IS DISTINCT FROM n0+2
  OR final_proof->>'revision' IS NOT DISTINCT FROM initial->>'revision' THEN RAISE EXCEPTION 'final-acceptance-history-proof';END IF;
 IF (SELECT count(*) FROM public.llm_usage WHERE usage_store_id='main-auth' AND usage_generation=p->>'generation' AND usage_ordinal<=n0)<>n0
  THEN RAISE EXCEPTION 'final-acceptance-history-prefix-count';END IF;
 IF n0=0 THEN prefix_head:=encode(sha256(convert_to('main-auth|'||(p->>'generation')||'|'||(p->>'originalHash'),'UTF8')),'hex');
 ELSE SELECT usage_chain_hash INTO STRICT prefix_head FROM public.llm_usage WHERE usage_store_id='main-auth'
  AND usage_generation=p->>'generation' AND usage_ordinal=n0;END IF;
 IF prefix_head IS DISTINCT FROM p->>'head' THEN RAISE EXCEPTION 'final-acceptance-old-logical-prefix-changed';END IF;
 d_head:=prefix_head;
 FOREACH phase IN ARRAY ARRAY['D','R'] LOOP
  phase_index:=phase_index+1;
  SELECT * INTO STRICT art FROM helmut_unit_diagnostic.artifacts WHERE scope_hash=a.scope_hash AND kind='usage-'||phase;
  SELECT * INTO STRICT u FROM public.llm_usage WHERE id=art.body->>'id';
  IF u.usage_store_id IS DISTINCT FROM 'main-auth' OR u.usage_generation IS DISTINCT FROM p->>'generation'
   OR u.usage_ordinal IS DISTINCT FROM n0+phase_index OR u.usage_prev_hash IS DISTINCT FROM d_head
   OR u.usage_record IS DISTINCT FROM art.body OR u.usage_record->>'scopeHash' IS DISTINCT FROM a.scope_hash
   OR art.logical_id IS DISTINCT FROM j#>>ARRAY['attempts',phase,'ticketId'] OR art.body->>'budgetTicketId' IS DISTINCT FROM art.logical_id
   OR art.body->>'costPhase' IS DISTINCT FROM phase OR art.body->>'costIntentId' IS DISTINCT FROM c#>>ARRAY['slot','plan','intents',(phase_index-1)::text,'id']
   OR art.body->>'costPlanHash' IS DISTINCT FROM c#>>'{slot,planHash}'
   OR art.body->>'costRequestHash' IS DISTINCT FROM j#>>ARRAY['attempts',phase,'requestHash']
   OR art.body->>'politicianId' IS DISTINCT FROM c#>>'{units,0,subject}' OR art.body->>'runId' IS DISTINCT FROM c#>>'{slot,plan,runId}'
   OR art.body->>'costBasis' IS DISTINCT FROM 'local-fixture-simulation-not-provider-charge' OR art.body->'success' IS DISTINCT FROM 'true'::jsonb
   OR u.created_at IS DISTINCT FROM (art.body->>'createdAt')::timestamptz OR u.model IS DISTINCT FROM a.request_models->>phase
   OR u.model IS DISTINCT FROM art.body->>'model' OR u.run_id IS DISTINCT FROM art.body->>'runId'
   OR u.politician_id IS DISTINCT FROM art.body->>'politicianId' OR u.success IS DISTINCT FROM true
   OR u.prompt_tokens IS DISTINCT FROM (art.body->>'promptTokens')::integer
   OR u.completion_tokens IS DISTINCT FROM (art.body->>'completionTokens')::integer
   OR u.total_tokens IS DISTINCT FROM (art.body->>'totalTokens')::integer
   OR u.estimated_cost IS DISTINCT FROM (art.body->>'estimatedCost')::numeric
   OR u.tenant_id IS DISTINCT FROM art.body->>'tenantId' OR u.profile_id IS DISTINCT FROM art.body->>'profileId'
   OR u.pipeline_step IS DISTINCT FROM art.body->>'pipelineStep' OR u.user_id IS DISTINCT FROM art.body->>'userId'
   OR u.call_type IS DISTINCT FROM art.body->>'callType' OR u.duration_ms IS DISTINCT FROM (art.body->>'durationMs')::integer
   OR u.error IS DISTINCT FROM art.body->>'error' OR art.parent_hash IS NOT NULL
   THEN RAISE EXCEPTION 'final-acceptance-two-actual-usage-records';END IF;
  IF u.created_at<entered OR u.created_at>=deadline THEN RAISE EXCEPTION 'final-acceptance-usage-time';END IF;
  d_head:=u.usage_chain_hash;
 END LOOP;
 IF d_head IS DISTINCT FROM final_proof#>>'{proof,head}' THEN RAISE EXCEPTION 'final-acceptance-final-history-head';END IF;
 SELECT data INTO STRICT auth_data FROM public.helmut_store WHERE id='main-auth';
 IF helmut_unit_diagnostic.original_bridge_own_projection_v1('main-auth',auth_data#>>'{_authStateRef,generation}',auth_data#>>'{_authStateRef,root}',a.operation_id)
  IS DISTINCT FROM own_state.body THEN RAISE EXCEPTION 'final-acceptance-main-auth-own-projection';END IF;
 PERFORM set_config('helmut.native_final_acceptance',jsonb_build_object('schema','helmut-local-unit-native-final-snapshot/1',
  'selection',selection,'database',current_database(),'databaseOID',(SELECT oid::text FROM pg_database WHERE datname=current_database()),
  'stateHash',own_state.body_hash,'stateRevision',own_state.revision,'evidenceHash',result_value->>'evidenceHash',
  'authorizationHash',j#>>'{verification,authorizationHash}','controlsHash',j#>>'{verification,controlsHash}',
  'ownArtifactCount',9,'originalResultRowCount',7,'positionCount',3,'controlCount',16,'freshGraphReadCount',16,
  'newUsageCount',2,'initialUsageCount',n0,'finalUsageCount',n0+2,'initialUsageHead',p->>'head','finalUsageHead',d_head,
  'historicalLogicalPrefixUnchanged',true,'finalACKAndReadbackBound',true,'snapshotAtUTC',
  to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))::text,true);
END;$final$;
SELECT current_setting('helmut.native_final_acceptance')::jsonb;
ROLLBACK;
""".replace('@INPUT@', encoded).replace('@TRACE_CHECKS@', _trace_sql())


def final_acceptance(query, *, command, expectedInitialUsageProof, actualEntryTerminal, actualEntryProcessClose, controlReadTrace):
    """No retry: accept only a complete actual SQL callback and external receipts."""
    try:
        _need(callable(query), 'query')
        database, selection, arguments = _inputs(*[_parse(_canonical(value)) for value in
            (command, expectedInitialUsageProof, actualEntryTerminal, actualEntryProcessClose, controlReadTrace)])
        sql = _sql(arguments)
        value = query(database, sql, 'FINAL_SINGLE_UNIT_READONLY_ACCEPTANCE')
        if type(value) is bytes:
            _need(len(value) <= 16384, 'capture-cap'); value = value.decode('utf8', errors='strict')
        if type(value) is str:
            _need(len(value.encode('utf8')) <= 16384, 'capture-cap'); value = _parse(value)
        _need(type(value) is dict and len(_canonical(value).encode('utf8')) <= 16384, 'capture-object-cap')
        value = _parse(_canonical(value))
        _validate_summary(value, database, selection, arguments)
        return {'schema': 'helmut-local-unit-native-final-acceptance/1', 'selection': selection, 'snapshot': value,
                'querySHA256': _sha(sql), 'entryTerminalSHA256': _sha(_canonical(arguments['terminal'])),
                'entryProcessCloseSHA256': _sha(_canonical(arguments['close'])), 'controlReadTraceSHA256': _sha(_canonical(arguments['trace'])),
                'nativeSingleUnitAccepted': True, 'independentProductAcceptance': False,
                'full500Accepted': False, 'production': False, 'paidProviderCallsAllowed': False}
    except Exception:
        raise FinalAcceptanceError('native-single-unit-final-acceptance-not-confirmed') from None
