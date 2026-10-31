"""Complete readonly native audit. Importing this module performs no actions.

Only capture() starts a process, and only for the fresh isolated D namespace.
The full private stdout is gzip-compressed without a second raw file. Failed
captures remain private, partial evidence and never become successful audits.
"""
import datetime
import decimal
import gzip
import hashlib
import json
import os
import pathlib
import selectors
import signal
import subprocess
import sys
import time
import zlib

ASSETS = pathlib.Path('/workspace/shared/helmut-w15-memory-forward-20261028')
WORK = pathlib.Path('/workspace/shared/helmut-w15-memory-atomic-20261028d')
BASE = '/tmp/w15-memory-atomic-20261028d'
CONTAINER = 'w15-memory-atomic-20261028d'
DATABASE = 'helmut_w15_memory_atomic_20261028d'
BOUND_SHA = '5d61bb67ff0def43d4cc24ad11db59bb388e0a0b630393b173a9178b5bd2bf2c'
MAX_ARCHIVE = 64 * 1024 * 1024
MAX_RAW = 128 * 1024 * 1024
MAX_ROW = 20 * 1024 * 1024
SECONDS = 300
COUNTS = {'evidenceRows': 500, 'privateDraftStoreRows': 500,
          'resultRows': 1500, 'privateDraftReviewRows': 1000}
AUTH_EXCLUSIONS = frozenset(('_authStoreRevision', 'w15MemoryProbeSequence'))


class AuditError(RuntimeError):
    pass


def _require(value, reason):
    if not value:
        raise AuditError('w15-final-audit-' + reason)


def _private_read(path):
    path = pathlib.Path(path)
    _require(path.is_file() and not path.is_symlink(), 'private-file')
    _require(path.stat().st_mode & 0o777 == 0o600, 'private-mode')
    return path.read_bytes()


def _fixtures(paths_or_assets, input_binding=None):
    """Load only the five already pinned immutable memory-volume fixtures."""
    if input_binding is not None:
        module = sys.modules.get('w15_github_runtime_inputs')
        _require(module is not None and type(input_binding) is module.RuntimeInputs, 'input-binding-type')
    bound_path = ASSETS / 'END500_MEMORY_BOUND.SAFE.json' if input_binding is None else input_binding.path('bound')
    bound_bytes = _private_read(bound_path)
    _require(hashlib.sha256(bound_bytes).hexdigest() == BOUND_SHA, 'bound-pin')
    bound = json.loads(bound_bytes, parse_float=decimal.Decimal)
    _require(bound['executionAuthority'] is False and bound['totalUsageRows'] == 6000,
             'inert-bound')
    if paths_or_assets is None and input_binding is not None:
        paths_or_assets = {key: input_binding.path(key) for key in ('auth', *COUNTS)}
    if paths_or_assets is None:
        paths_or_assets = ASSETS
    if isinstance(paths_or_assets, dict):
        paths = paths_or_assets
    else:
        _require(pathlib.Path(paths_or_assets).resolve() == ASSETS, 'assets-scope')
        paths = {k: v['path'] for k, v in bound['protectedOutputPins'].items()}
    loaded = {}
    for key in ('auth', *COUNTS):
        expected = bound['protectedOutputPins'][key]
        path = pathlib.Path(paths[key])
        if input_binding is None:
            _require(path.resolve() == pathlib.Path(expected['path']), 'fixture-path')
        else:
            _require(path == input_binding.resolve(expected)
                     and pathlib.Path(expected['path']) == input_binding.original_path(key), 'fixture-path')
        data = _private_read(path)
        _require(len(data) == expected['bytes'] and
                 hashlib.sha256(data).hexdigest() == expected['sha256'], 'fixture-pin')
        loaded[key] = json.loads(data, parse_float=decimal.Decimal)
        if key != 'auth':
            rows = loaded[key]
            _require(isinstance(rows, list) and len(rows) == COUNTS[key], 'fixture-count')
            _require(all(isinstance(x, dict) and isinstance(x.get('id'), str)
                         for x in rows), 'fixture-row')
            _require(len({x['id'] for x in rows}) == len(rows), 'fixture-duplicate')
    _require(len(loaded['auth']['llmUsage']) == 6000, 'fixture-usage-count')
    return loaded


def _literal(value):
    _require(isinstance(value, str) and '\x00' not in value, 'literal')
    return "'" + value.replace("'", "''") + "'"


def _sql_for(fixtures):
    store_ids = [x['id'] for k in ('evidenceRows', 'privateDraftStoreRows')
                 for x in fixtures[k]]
    briefing_ids = [x['id'] for k in ('resultRows', 'privateDraftReviewRows')
                    for x in fixtures[k]]
    _require(len(set(store_ids)) == 1000 and len(set(briefing_ids)) == 2500,
             'cross-collection-duplicate')
    meta = """select jsonb_build_object(
      'kind','metadata','active',(select count(*) from public.mandate_profiles where aktiv),
      'database',current_database(),'profiles',(select count(*) from public.mandate_profiles),
      'readonly',current_setting('transaction_read_only'),
      'identities',(select count(*) from public.profiles),
      'mainUsageRows',(select (data#>>'{_llmUsageRef,count}')::bigint from public.helmut_store where id='main-auth'),
      'physicalUsageRows',(select count(*) from public.llm_usage),
      'physicalAuthHasUsage',(select data ? 'llmUsage' from public.helmut_store where id='main-auth'));"""
    auth = "select jsonb_build_object('kind','auth','data',public.helmut_auth_usage_read_v1('{\"id\":\"main-auth\"}'::jsonb)->'data');"
    store = ("select jsonb_build_object('kind','store','id',s.id,'data',s.data) "
             "from public.helmut_store s where s.id=any(array[" +
             ','.join(map(_literal, store_ids)) + "]::text[]) order by s.id collate \"C\";")
    briefing = ("select jsonb_build_object('kind','briefing','id',b.id,'data',to_jsonb(b)) "
                "from public.briefings b where b.id=any(array[" +
                ','.join(map(_literal, briefing_ids)) + "]::text[]) order by b.id collate \"C\";")
    return meta, auth, store, briefing


def audit_sql(paths_or_assets=None, *, input_binding=None):
    """Four SELECT statements only; capture supplies the common readonly txn."""
    return _sql_for(_fixtures(paths_or_assets, input_binding))


def _deep_equal(a, b):
    # JSON number semantics allow 1/1.0, but never conflate true with 1.
    if isinstance(a, bool) or isinstance(b, bool):
        return type(a) is type(b) and a == b
    if isinstance(a, dict) and isinstance(b, dict):
        return a.keys() == b.keys() and all(_deep_equal(a[k], b[k]) for k in a)
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(_deep_equal(x, y) for x, y in zip(a, b))
    return type(a) is type(b) and a == b or (
        type(a) in (int, decimal.Decimal) and type(b) in (int, decimal.Decimal) and a == b)


def _json_object(pairs):
    out = {}
    for key, value in pairs:
        _require(key not in out, 'duplicate-json-key')
        out[key] = value
    return out


def _guard(guard, phase, raw_bytes, archive_bytes, deadline):
    _require(time.monotonic() < deadline, 'deadline')
    _require(raw_bytes <= MAX_RAW, 'raw-ceiling')
    _require(archive_bytes <= MAX_ARCHIVE, 'archive-ceiling')
    if guard is not None:
        guard({'phase': phase, 'rawBytes': raw_bytes, 'archiveBytes': archive_bytes,
               'remainingAuditAllowanceBytes': max(0, MAX_ARCHIVE - archive_bytes)})


def _verify(archive, fixtures, database, expected_probe, guard, deadline,
            expected_raw_hash=None, expected_raw_bytes=None):
    archive = pathlib.Path(archive)
    _require(archive.is_file() and not archive.is_symlink(), 'archive-file')
    _require(archive.stat().st_mode & 0o777 == 0o600, 'archive-mode')
    archive_bytes = archive.stat().st_size
    expected_store = {x['id']: x['data'] for k in ('evidenceRows', 'privateDraftStoreRows')
                      for x in fixtures[k]}
    expected_briefing = {x['id']: x for k in ('resultRows', 'privateDraftReviewRows')
                         for x in fixtures[k]}
    _require(len(expected_store) == 1000 and len(expected_briefing) == 2500,
             'expected-unique-counts')
    seen = {'store': set(), 'briefing': set()}
    metadata = None
    auth_seen = False
    raw_bytes = 0
    raw_hash = hashlib.sha256()
    probe = None
    with gzip.open(archive, 'rb') as stream:
        while True:
            _guard(guard, 'verify', raw_bytes, archive_bytes, deadline)
            line = stream.readline(MAX_ROW + 1)
            if not line:
                break  # Reading to EOF validates the gzip trailer and CRC.
            _require(len(line) <= MAX_ROW and line.endswith(b'\n'), 'row-ceiling-or-partial')
            raw_bytes += len(line)
            raw_hash.update(line)
            _guard(guard, 'verify', raw_bytes, archive_bytes, deadline)
            row = json.loads(line, object_pairs_hook=_json_object, parse_float=decimal.Decimal,
                             parse_constant=lambda _: (_ for _ in ()).throw(AuditError('w15-final-audit-nonfinite-json')))
            _require(isinstance(row, dict), 'row-object')
            kind = row.get('kind')
            if kind == 'metadata':
                _require(metadata is None and not auth_seen and not any(seen.values()), 'metadata-position')
                required = {'kind': 'metadata', 'active': 0, 'database': database,
                            'profiles': 500, 'readonly': 'on', 'identities': 501,
                            'mainUsageRows': 6000, 'physicalUsageRows': 6000,
                            'physicalAuthHasUsage': False}
                _require(_deep_equal(row, required), 'metadata-zero-counts')
                metadata = row
            elif kind == 'auth':
                _require(metadata is not None and not auth_seen and set(row) == {'kind', 'data'}, 'auth-count')
                actual = row['data']
                _require(isinstance(actual, dict) and len(actual.get('llmUsage', [])) == 6000, 'native-usage-count')
                _require(_deep_equal({k: v for k, v in actual.items() if k not in AUTH_EXCLUSIONS},
                                     {k: v for k, v in fixtures['auth'].items() if k not in AUTH_EXCLUSIONS}),
                         'full-auth-postimage')
                probe = actual.get('w15MemoryProbeSequence')
                _require(probe is None or type(probe) is int and probe >= 0, 'probe-shape')
                if expected_probe is not None:
                    _require(type(expected_probe) is int and probe == expected_probe, 'probe-expected')
                auth_seen = True
            elif kind in seen:
                _require(auth_seen and set(row) == {'kind', 'id', 'data'}, 'native-row-shape')
                row_id = row['id']
                _require(isinstance(row_id, str) and row_id not in seen[kind], 'native-duplicate')
                expected = expected_store if kind == 'store' else expected_briefing
                _require(row_id in expected and _deep_equal(row['data'], expected[row_id]), 'native-postimage')
                seen[kind].add(row_id)
            else:
                raise AuditError('w15-final-audit-unknown-kind')
    _require(metadata is not None and auth_seen and seen['store'] == expected_store.keys()
             and seen['briefing'] == expected_briefing.keys(), 'complete-cardinality')
    digest = raw_hash.hexdigest()
    if expected_raw_hash is not None:
        _require(digest == expected_raw_hash and raw_bytes == expected_raw_bytes, 'raw-stream-roundtrip')
    return {'status': 'PASS_COMPLETE_LOSSLESS_NATIVE_POSTIMAGES_AND_ZERO_ONLY',
            'activeProfiles': 0, 'profiles': 500, 'identities': 501,
            'snapshotReadOnly': True, 'snapshotIsolation': 'repeatable read',
            'exactAuthPostimages': 1, 'exactStorePostimages': 1000,
            'exactBriefingPostimages': 2500, 'totalExactPostimages': 3501,
            'fullLogicalUsageRows': 6000, 'allHistoricalAndInertAuthFieldsEqual': True,
            'authExcludedFields': sorted(AUTH_EXCLUSIONS), 'observedNativeProbeSequence': probe,
            'expectedProbeRequired': expected_probe, 'rawBytes': raw_bytes,
            'rawSHA256': digest, 'gzipEOFAndCRCVerified': True,
            'separateFreshAfterSnapshotZeroReadStillRequired': True,
            'executionAuthority': False, 'full500Acceptance': False}


def verify_capture(archive, paths_or_assets=None, database=DATABASE,
                   expectedProbe=None, guard=None, input_binding=None):
    """Offline-only verifier, also usable for a separately approved old-C control."""
    return _verify(archive, _fixtures(paths_or_assets, input_binding), database, expectedProbe,
                   guard, time.monotonic() + SECONDS)


def _save_exclusive(path, value):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.write('\n')
        stream.flush()
        os.fdatasync(stream.fileno())


def capture(container, database, work, paths_or_assets=None, expectedProbe=None,
            guard=None, stop_owned=None, input_binding=None):
    """Exactly one native read. guard(state) is phase-aware; stop_owned() must
    verify the existing controller's owned audit process group has exited.
    Both callbacks are mandatory: this helper never creates/restarts resources.
    """
    _require(container == CONTAINER and database == DATABASE and pathlib.Path(work) == WORK,
             'fresh-D-only')
    _require(WORK.is_dir() and not WORK.is_symlink() and WORK.stat().st_mode & 0o777 == 0o700,
             'work-mode')
    _require(callable(guard) and callable(stop_owned), 'required-supervisor-callbacks')
    deadline = time.monotonic() + SECONDS
    fixtures = _fixtures(paths_or_assets, input_binding)
    sql = ("begin isolation level repeatable read read only;\n"
           "set local statement_timeout='45s';set local lock_timeout='3s';\n"
           "set local client_encoding='UTF8';\n" + '\n'.join(_sql_for(fixtures)) +
           '\nrollback;\n').encode('utf-8')
    archive = WORK / 'FINAL_NATIVE_AUDIT.PRIVATE.jsonl.gz'
    stderr_path = WORK / 'FINAL_NATIVE_AUDIT_STDERR.PRIVATE.log'
    summary_path = WORK / 'FINAL_NATIVE_AUDIT.SAFE.json'
    _require(not archive.exists() and not stderr_path.exists() and not summary_path.exists(), 'once-only-output')
    _save_exclusive(WORK / 'FINAL_NATIVE_AUDIT_ATTEMPT.SAFE.json',
                    {'startedAtUTC': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                     'database': database, 'singleReadAttempt': True, 'retryAllowed': False})
    raw_hash = hashlib.sha256()
    raw_bytes = archive_bytes = stderr_bytes = 0
    stderr_hash = hashlib.sha256()
    stderr_target = None
    stderr_eof = False
    process = None
    success = False
    result = None
    failure = None
    close_failure = None
    selector = selectors.DefaultSelector()
    fd = os.open(archive, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, 'wb') as target:
            stderr_target = os.fdopen(os.open(stderr_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'wb')
            compressor = zlib.compressobj(level=6, wbits=31)
            def write(data):
                nonlocal archive_bytes
                _guard(guard, 'capture', raw_bytes, archive_bytes + len(data), deadline)
                target.write(data)
                archive_bytes += len(data)
            _guard(guard, 'capture', 0, 0, deadline)
            command = ('umask 077; echo $$ >' + BASE + '/state/audit.pid; '
                       'exec timeout --signal=TERM --kill-after=5s 290s '
                       'psql -X -w -qAt -v ON_ERROR_STOP=1 -U postgres -d ' + database + ' -f -')
            process = subprocess.Popen(['docker', '--host=unix:///var/run/docker.sock', 'exec', '-i',
                                        '--user', '1000:1000', container, 'sh', '-c', command],
                                       stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                       env={'PATH': os.environ['PATH'], 'LANG': 'C.UTF-8'}, start_new_session=True)
            for stream, event, tag in ((process.stdin, selectors.EVENT_WRITE, 'in'),
                                       (process.stdout, selectors.EVENT_READ, 'out'),
                                       (process.stderr, selectors.EVENT_READ, 'err')):
                os.set_blocking(stream.fileno(), False)
                selector.register(stream, event, tag)
            sent = 0
            while selector.get_map():
                _guard(guard, 'capture', raw_bytes, archive_bytes, deadline)
                for key, _ in selector.select(timeout=.1):
                    stream = key.fileobj
                    if key.data == 'in':
                        sent += os.write(stream.fileno(), sql[sent:sent + 65536])
                        if sent == len(sql):
                            selector.unregister(stream)
                            stream.close()
                        continue
                    chunk = os.read(stream.fileno(), 65536)
                    if not chunk:
                        if key.data == 'err':
                            stderr_eof = True
                        selector.unregister(stream)
                        stream.close()
                    elif key.data == 'out':
                        raw_bytes += len(chunk)
                        _guard(guard, 'capture', raw_bytes, archive_bytes, deadline)
                        raw_hash.update(chunk)
                        write(compressor.compress(chunk))
                    else:
                        stderr_target.write(chunk)
                        stderr_bytes += len(chunk)
                        stderr_hash.update(chunk)
                        _guard(guard, 'capture', raw_bytes, archive_bytes, deadline)
            _require(process.wait(timeout=max(.001, deadline-time.monotonic())) == 0, 'psql-exit')
            _require(sent == len(sql), 'sql-delivery')
            write(compressor.flush())
            target.flush()
            os.fdatasync(target.fileno())
            success = True
    except BaseException as error:
        failure = {'type': type(error).__name__,
                   'reason': str(error) if isinstance(error, AuditError) else 'native-capture-failed-or-unknown'}
    finally:
        selector.close()
        if process is not None:
            try:
                stop_owned()
            except BaseException as error:
                close_failure = {'type': type(error).__name__, 'reason': 'owned-audit-exit-unconfirmed'}
            for stream in (process.stdin, process.stdout):
                if stream is not None and not stream.closed:
                    stream.close()
            # Drain retained stderr even after an earlier guard/pipe failure.
            # Do not discard cancellation diagnostics still in the pipe.
            for sig in (signal.SIGTERM, signal.SIGKILL):
                if process.poll() is None:
                    try:
                        os.killpg(process.pid, sig)
                    except ProcessLookupError:
                        pass
                end = time.monotonic() + 5
                while time.monotonic() < end:
                    if process.stderr is not None and not process.stderr.closed and not stderr_eof:
                        try:
                            chunk = os.read(process.stderr.fileno(), 65536)
                        except BlockingIOError:
                            chunk = None
                        if chunk == b'':
                            stderr_eof = True
                        elif chunk:
                            stderr_target.write(chunk)
                            stderr_bytes += len(chunk)
                            stderr_hash.update(chunk)
                            try:
                                _guard(guard, 'closure', raw_bytes, archive_bytes, deadline)
                            except BaseException as error:
                                failure = failure or {'type': type(error).__name__, 'reason': 'closure-guard-failed-or-unknown'}
                    if process.poll() is not None and stderr_eof:
                        break
                    time.sleep(.01)
                if process.poll() is not None and stderr_eof:
                    break
            if process.poll() is None or not stderr_eof:
                failure = failure or {'type': 'AuditError', 'reason': 'client-exit-or-full-stderr-unconfirmed'}
            if process.stderr is not None and not process.stderr.closed:
                process.stderr.close()
        if close_failure:
            failure = failure or close_failure
        if stderr_target is not None:
            try:
                stderr_target.flush()
                os.fdatasync(stderr_target.fileno())
            except BaseException as error:
                failure = failure or {'type': type(error).__name__, 'reason': 'private-stderr-sync-failed-or-unknown'}
            finally:
                stderr_target.close()
    if success and failure is None:
        try:
            result = _verify(archive, fixtures, database, expectedProbe, guard, deadline,
                             raw_hash.hexdigest(), raw_bytes)
        except BaseException as error:
            failure = {'type': type(error).__name__,
                       'reason': str(error) if isinstance(error, AuditError) else 'archive-verification-failed-or-unknown'}
    archive_hash = hashlib.sha256()
    with archive.open('rb') as stream:
        for chunk in iter(lambda: stream.read(65536), b''):
            archive_hash.update(chunk)
    summary = result or {'status': 'FAIL_OR_UNKNOWN', 'full500Acceptance': False}
    summary.update({'failure': failure, 'ownedCloseFailure': close_failure,
                    'captureComplete': success, 'readAttempts': 1, 'retryAllowed': False,
                    'capturedRawBytes': raw_bytes, 'capturedRawSHA256': raw_hash.hexdigest(),
                    'stderrBytes': stderr_bytes, 'stderrSHA256': stderr_hash.hexdigest(),
                    'stderrCaptureComplete': stderr_eof,
                    'actualPopenReturncode': process.returncode if process is not None else None,
                    'gzipPin': {'path': str(archive), 'bytes': archive.stat().st_size,
                                'sha256': archive_hash.hexdigest()}})
    _save_exclusive(summary_path, summary)
    if failure:
        raise AuditError('w15-final-audit-failed-or-unknown-preserved')
    return summary
