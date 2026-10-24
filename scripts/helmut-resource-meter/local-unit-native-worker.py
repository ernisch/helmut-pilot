#!/usr/bin/env python3
"""Fresh V12 copy and native PG17 qualification under one measured parent.

Only an explicitly bound single-unit mode can call the once-only coordinator.
Preparation alone establishes no Unit60, profile or full500 acceptance.
"""
import datetime
import hashlib
import json
import os
from pathlib import Path
import signal
import selectors
import stat
import subprocess
import sys
import time
import threading
import types

OUT = Path('/bench')
GROUP = Path('/owned-group')
RAM = Path('/ram')
PGDATA = OUT / 'PGDATA_WORKING_COPY_NOT_AN_ORIGINAL'
PGBIN = Path('/usr/lib/postgresql/17/bin')
SOURCE_DATABASE = 'helmut_resource_fixture_20261021_f3375a7d5548'
RAW_SHA = '54df2ecc0e4fdc22adf75f2ce3491d3c921e38296510543dcdadd48db3f37693'
START = time.monotonic()
LIMITS = {'memory.max': '1547997184', 'memory.high': '1399996416', 'memory.swap.max': '0'}
LIBRARY_PATH = ''
CHILDREN = []
LOGS = []


def save(name, value):
    target = OUT / name
    fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as stream:
        json.dump(value, stream, indent=2)
        stream.write('\n')
        stream.flush()
        os.fsync(stream.fileno())


def capture_final_original_failure(error, phase, source_index, checked_count):
    """Private metadata only; checked_count counts matched source pins, not RAW."""
    try:
        frames = []
        frame = error.__traceback__
        while frame is not None and len(frames) < 12:
            code = frame.tb_frame.f_code
            frames.append({'file': Path(code.co_filename).name[:160],
                           'function': code.co_name[:96], 'line': frame.tb_lineno})
            frame = frame.tb_next
        number = error.errno if isinstance(error, OSError) else None
        save('FINAL_ORIGINAL_CHECK_FAILURE.PRIVATE.json', {
            'schema': 'helmut-local-unit-final-original-check-failure/1',
            'phase': phase, 'sourceIndex': source_index, 'checkedCount': checked_count,
            'exceptionType': type(error).__name__[:96],
            'errno': number if type(number) is int and -(2**31) <= number < 2**31 else None,
            'stack': frames, 'stackTruncated': frame is not None})
    except BaseException:
        # The original failure is already recorded and remains terminal. This
        # fixed code neither exposes the failed write nor claims a saved file.
        try:
            sys.stderr.write('{"schema":"helmut-local-unit-final-original-capture-failure/1",'
                             '"code":"private-capture-not-persisted"}\n')
        except BaseException:
            pass  # Secondary output failures cannot mask the original failure.


def pin(path):
    path = Path(path)
    before = path.lstat()
    assert path.resolve() == path and stat.S_ISREG(before.st_mode) and before.st_nlink == 1
    h = hashlib.sha256()
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        first = os.fstat(fd)
        size = 0
        while block := os.read(fd, 1024 * 1024):
            h.update(block)
            size += len(block)
        after, named = os.fstat(fd), path.lstat()
        for field in ['st_dev', 'st_ino', 'st_size', 'st_mode', 'st_nlink', 'st_mtime_ns', 'st_ctime_ns']:
            assert getattr(before, field) == getattr(first, field) == getattr(after, field) == getattr(named, field)
        assert size == before.st_size
        return {'path': str(path), 'bytes': size, 'sha256': h.hexdigest()}
    finally:
        os.close(fd)


def load(name, meta):
    assert pin(meta['path']) == meta
    module = types.ModuleType(name)
    module.__file__ = meta['path']
    exec(compile(Path(meta['path']).read_bytes(), meta['path'], 'exec'), module.__dict__)
    return module


def guard(config):
    assert time.monotonic() - START < 270
    assert (GROUP.stat().st_dev, GROUP.stat().st_ino) == (config['parentDevice'], config['parentInode'])
    assert {key: (GROUP / key).read_text().strip() for key in LIMITS} == LIMITS
    events = dict(line.split() for line in (GROUP / 'memory.events').read_text().splitlines())
    assert int(events['oom']) == int(events['oom_kill']) == 0
    v = os.statvfs(OUT)
    assert v.f_bavail * v.f_frsize >= 8 * 1024**3
    assert all(not row['overflow'] and row['error'] is None for row in LOGS)


def child_env():
    return {'PATH': str(PGBIN) + ':/usr/bin:/bin', 'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8',
            'HOME': str(RAM), 'TMPDIR': str(RAM), 'LD_LIBRARY_PATH': LIBRARY_PATH,
            'PGCONNECT_TIMEOUT': '5', 'PYTHONDONTWRITEBYTECODE': '1'}


def capture(argv, label, *, data=None, timeout=30):
    # Diagnostic failures retain real stderr privately. No SQL/row/error payload
    # is printed to the control terminal or used as an execution acceptance.
    stdout = OUT / (label + '.STDOUT.PRIVATE.log')
    stderr = OUT / (label + '.STDERR.PRIVATE.log')
    process = subprocess.Popen(argv, stdin=subprocess.PIPE if data is not None else subprocess.DEVNULL,
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=child_env())
    CHILDREN.append(process)
    selector, buffers = selectors.DefaultSelector(), [bytearray(), bytearray()]
    for index, stream in enumerate([process.stdout, process.stderr]):
        os.set_blocking(stream.fileno(), False)
        selector.register(stream, selectors.EVENT_READ, index)
    remaining = memoryview(data) if data else memoryview(b'')
    if data is not None:
        if remaining:
            os.set_blocking(process.stdin.fileno(), False)
            selector.register(process.stdin, selectors.EVENT_WRITE, 2)
        else:
            process.stdin.close()
    deadline = time.monotonic() + timeout
    try:
        while selector.get_map():
            if time.monotonic() >= deadline:
                raise RuntimeError('native bounded capture deadline at ' + label)
            for key, _ in selector.select(.05):
                if key.data == 2:
                    try:
                        sent = os.write(key.fd, remaining[:16384])
                        remaining = remaining[sent:]
                    except BrokenPipeError:
                        remaining = memoryview(b'')
                    if not remaining:
                        selector.unregister(key.fileobj); key.fileobj.close()
                    continue
                block = os.read(key.fd, 16384)
                if not block:
                    selector.unregister(key.fileobj)
                    continue
                cap = 2 * 1024**2 if key.data == 0 else 128 * 1024
                if len(buffers[key.data]) + len(block) > cap:
                    raise RuntimeError('native bounded capture overflow at ' + label)
                buffers[key.data].extend(block)
        process.wait(timeout=max(.01, deadline - time.monotonic()))
    finally:
        selector.close()
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill(); process.wait(timeout=5)
        for stream in [process.stdin, process.stdout, process.stderr]:
            if stream is not None and not stream.closed:
                stream.close()
        for path, raw in zip([stdout, stderr], buffers):
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            with os.fdopen(fd, 'wb') as output:
                output.write(raw)
    if process.returncode:
        raise RuntimeError('native child failed at ' + label + '; retained private stderr')
    return stdout.read_bytes()


def start_log(argv, label):
    child = subprocess.Popen(argv, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                             stderr=subprocess.STDOUT, env=child_env())
    CHILDREN.append(child)
    row = {'label': label, 'data': bytearray(), 'eof': False, 'overflow': False, 'error': None}
    LOGS.append(row)
    def drain():
        try:
            while True:
                block = child.stdout.read1(4096)
                if not block:
                    row['eof'] = True
                    break
                if len(row['data']) + len(block) > 128 * 1024:
                    row['overflow'] = True
                row['data'].extend(block[:max(0, 128 * 1024 - len(row['data']))])
        except BaseException as error:
            row['error'] = type(error).__name__
    row['thread'] = threading.Thread(target=drain, daemon=True)
    row['thread'].start()
    return child, row


def stop(signum, frame):
    raise InterruptedError('owned native qualification interrupted')


def restore_readonly_libraries(config, jit):
    # Restore the five exact missing temporary library files from the retained
    # original image. The pinned streaming parser verifies every layer and the
    # complete overlay. No package download, substitute ABI or source edit.
    plan = jit.load_plan()
    expected = jit.checked_json(Path(plan['rootManifest']['path']),
                                expected_bytes=plan['rootManifest']['rawBytes'],
                                expected_sha=plan['rootManifest']['rawSHA256'])
    root = Path('/tmp/helmut-meter-filesystem-tools')
    mount = jit.mount_record(root)
    assert mount['filesystem'] == 'tmpfs' and 'rw' in mount['options']
    assert root.stat().st_uid == os.getuid() and not any(root.iterdir())
    stage = root / 'source'
    stage.mkdir(mode=0o700)
    targets = {row['originalPath']: expected[row['originalPath']] for row in config['nativeReaderLibraries']}
    before = jit.cgroup_snapshot(GROUP, '0::/\n', plan['nativeLimits'])
    overlay, materialized, layers, headers = jit._restore_stream(plan, Path(plan['archive']['path']), stage, targets)
    assert overlay == expected and set(materialized) == set(targets)
    (root / 'lib').mkdir(mode=0o700)
    pins = []
    for row in config['nativeReaderLibraries']:
        assert targets[row['originalPath']]['size'] == row['bytes'] and targets[row['originalPath']]['sha256'] == row['sha256']
        target = Path(row['path'])
        assert target.parent == root / 'lib'
        os.rename(stage / row['originalPath'], target)
        actual = pin(target)
        assert actual == {key: row[key] for key in ['path', 'bytes', 'sha256']}
        pins.append(actual)
    save('READONLY_LIBRARIES_RESTORED.SAFE.json', {
        'schema': 'helmut-local-unit-original-readonly-libraries/1', 'files': pins,
        'sourceArchive': plan['archive'], 'rootManifestSHA256': plan['rootManifest']['rawSHA256'],
        'fullOriginalOverlayVerified': True, 'layerProofs': layers, 'tarHeaders': headers,
        'nativeBefore': before, 'nativeAfter': jit.cgroup_snapshot(GROUP, '0::/\n', plan['nativeLimits']),
        'restoredInsideMeasuredParent': True, 'originalsModified': False})
    return pins


def query(database, text, label):
    return capture([str(PGBIN / 'psql'), '-X', '-qAt', '-w', '-h', str(RAM / 'socket'),
                    '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1', '-f', '-'],
                   label, data=text.encode()).decode().strip()


def main():
    global LIBRARY_PATH
    os.umask(0o077)
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    config = json.loads((OUT / 'WORKER_CONFIG.SAFE.json').read_text())
    assert os.getuid() == 1000 and Path('/proc/self/cgroup').read_text() == '0::/\n'
    assert config['motorCalls'] == 0 and config['full500'] is False and config['paidProviderCalls'] == 0
    guard(config)
    original_before = pin(config['raw']['path'])
    assert original_before == config['raw'] and original_before['sha256'] == RAW_SHA
    jit = load('local_unit_original_jit', config['jitHelper'])
    library_pins = restore_readonly_libraries(config, jit)
    reader_module = load('local_unit_readonly_ext4', config['reader'])
    for library in library_pins:
        assert pin(library['path']) == library
    reader = reader_module.Reader(Path(config['raw']['path']))
    try:
        rows = reader.inventory('/pgdata')
        assert sum(row['type'] == 'file' for row in rows) == 1714
        assert sum(row.get('bytes', 0) for row in rows) == 372011391
        assert not any(row['relative'] == 'postmaster.pid' for row in rows)
        manifest = reader.copy_tree(rows, PGDATA)
    finally:
        reader.close()
    save('FRESH_COPY_FILE_MANIFEST.SAFE.json', manifest)
    assert pin(config['copyManifest']['path']) == config['copyManifest']
    assert manifest == json.loads(Path(config['copyManifest']['path']).read_text()), 'authentic POSTRUN file manifest mismatch'
    save('FRESH_COPY.SAFE.json', {'source': original_before, 'files': 1714, 'bytes': 372011391,
                                 'readonlyExt2fsFlags': 0x20000, 'newCopyIsNotOriginal': True,
                                 'noMountOrLoopAction': True})
    assert pin(config['raw']['path']) == original_before
    restored = jit.restore(RAM / 'jit-root', cgroup_dir=GROUP, expected_cgroup_membership='0::/\n')
    for row in restored['postgresLibLinks']:
        link, target = Path(row['path']), Path(row['target'])
        assert link.parent == Path('/usr/lib/postgresql/17/lib') and target.is_relative_to(RAM / 'jit-root')
        link.symlink_to(target)
    LIBRARY_PATH = restored['libraryPath'] + ':/usr/lib/x86_64-linux-gnu'
    save('ORIGINAL_JIT_RESTORED.SAFE.json', restored)
    assert b'shut down' in capture([str(PGBIN / 'pg_controldata'), str(PGDATA)], 'CONTROL_DATA')
    (RAM / 'socket').mkdir(mode=0o700)
    pgargs = [str(PGBIN / 'postgres'), '-D', str(PGDATA), '-k', str(RAM / 'socket'), '-p', '5432']
    settings = {'listen_addresses': '', 'data_directory': str(PGDATA), 'hba_file': str(PGDATA / 'pg_hba.conf'),
                'ident_file': str(PGDATA / 'pg_ident.conf'), 'shared_buffers': '128MB', 'work_mem': '4MB',
                'temp_file_limit': '128MB', 'max_parallel_workers_per_gather': '0', 'jit': 'on',
                'autovacuum': 'off', 'statement_timeout': '30s', 'lock_timeout': '1s',
                'logging_collector': 'off', 'log_statement': 'none', 'log_min_duration_statement': '-1',
                'log_line_prefix': '%m [%p] ', 'log_transaction_sample_rate': '0', 'log_duration': 'off',
                # Keep genuine psql failures in bounded private captures. A
                # failed statement can contain a complete private command;
                # duplicating it in the server log exhausts its independent cap.
                'log_min_error_statement': 'panic', 'log_error_verbosity': 'terse',
                'helmut.local_usage_experiment': 'on', 'helmut.local_pipeline_lock_mode': 'invocation-lease-v1'}
    if config.get('executeNativeSingleUnit') is True:
        # New COPY-only HBA, not the preserved original. The UID1000 source
        # owns the private Unix socket. TCP permits only this fresh diagnostic
        # authenticator/database on the container's isolated local loopback.
        database = 'helmut_unit_diagnostic_' + config['nonce']
        authenticator = 'helmut_ud_authenticator_' + config['nonce']
        hba = OUT / 'OWN_DIAGNOSTIC_HBA.PRIVATE.conf'
        fd = os.open(hba, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'w') as stream:
            stream.write('local all postgres trust\nlocal all all reject\n'
                         + 'host ' + database + ' ' + authenticator + ' 127.0.0.1/32 scram-sha-256\n'
                         + 'host all all 0.0.0.0/0 reject\nhost all all ::/0 reject\n')
            stream.flush(); os.fsync(stream.fileno())
        settings.update(listen_addresses='127.0.0.1', hba_file=str(hba))
    for key, value in settings.items():
        pgargs += ['-c', key + '=' + value]
    failure, codes, result = None, {}, None
    fresh_binding_result = None
    pg = None
    try:
        try:
            pg, pg_log = start_log(pgargs, 'POSTGRES')
            deadline = time.monotonic() + 25
            while not (RAM / 'socket/.s.PGSQL.5432').exists():
                guard(config)
                assert pg.poll() is None and time.monotonic() < deadline
                time.sleep(.05)
            # The socket may appear just before the server accepts sessions.
            # Wait for its actual ready log without issuing any repeated write.
            while True:
                guard(config)
                if b'database system is ready to accept connections' in pg_log['data']:
                    break
                assert pg.poll() is None and time.monotonic() < deadline
                time.sleep(.05)
            source_sql = "BEGIN READ ONLY; select jsonb_build_object('version',current_setting('server_version_num'),'authSHA256',encode(sha256(convert_to(data::text,'UTF8')),'hex')) from public.helmut_store where id='main-auth';COMMIT;"
            before = json.loads(query(SOURCE_DATABASE, source_sql, 'SOURCE_LOGICAL_BEFORE'))
            assert before['version'] == '170006'
            database = 'helmut_unit_diagnostic_' + config['nonce']
            query('postgres', 'ALTER DATABASE ' + SOURCE_DATABASE + ' RENAME TO ' + database + ';', 'OWN_DATABASE_RENAME')
            ddl = Path(config['repository']) / 'scripts/helmut-resource-meter/local-unit-diagnostic-store.sql'
            query(database, "SELECT set_config('helmut.local_unit_diagnostic_install_target',current_database(),false);\n" + ddl.read_text(), 'NATIVE_DDL_INSTALL')
            after = json.loads(query(database, source_sql, 'SOURCE_LOGICAL_AFTER'))
            assert before == after
            qualifier = load('local_unit_native_role_qualification', config['roleQualifier'])
            role_result = qualifier.qualify(query, database, config['nonce'])
            assert role_result['executedChecksPassed'] is True
            save('NATIVE_ROLE_QUALIFICATION.SAFE.json', role_result)
            catalog_sql = """BEGIN READ ONLY;
WITH original_rel AS (
  SELECT unnest(ARRAY['public.helmut_store'::regclass,'public.helmut_auth_state_nodes_local'::regclass,
    'public.llm_usage'::regclass,'public.briefings'::regclass]) AS oid
), original_proc AS (
  SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname LIKE 'helmut_auth_%'
  UNION SELECT t.tgfoid FROM pg_trigger t JOIN original_rel r ON r.oid=t.tgrelid WHERE NOT t.tgisinternal
), sources AS (
  SELECT p.oid,n.nspname,p.proname,jsonb_build_object('oid',p.oid::text,'name',n.nspname||'.'||p.proname,
    'identityArguments',oidvectortypes(p.proargtypes),'prosrcSHA256',encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'),
    'volatility',p.provolatile,'returnType',format_type(p.prorettype,null),'language',l.lanname,'config',p.proconfig) AS pin,
    p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
)
SELECT jsonb_build_object('database',current_database(),
  'databaseOID',(SELECT oid::text FROM pg_database WHERE datname=current_database()),
  'functions',(SELECT jsonb_agg(pin||jsonb_build_object('securityDefiner',prosecdef) ORDER BY oid) FROM sources
    WHERE nspname='public' AND proname LIKE 'helmut%'),
  'originalSources',(SELECT jsonb_agg(pin||jsonb_build_object('securityDefiner',prosecdef) ORDER BY oid) FROM sources
    WHERE oid IN(SELECT oid FROM original_proc)),
  'originalTriggers',(SELECT jsonb_agg(jsonb_build_object('oid',t.oid::text,'table',t.tgrelid::regclass::text,
    'name',t.tgname,'functionOID',t.tgfoid::text,'enabled',t.tgenabled,'type',t.tgtype,
    'definitionSHA256',encode(sha256(convert_to(pg_get_triggerdef(t.oid),'UTF8')),'hex')) ORDER BY t.oid)
    FROM pg_trigger t JOIN original_rel r ON r.oid=t.tgrelid WHERE NOT t.tgisinternal),
  'nativeSources',(SELECT jsonb_agg(pin||jsonb_build_object('securityDefiner',prosecdef) ORDER BY oid) FROM sources
    WHERE nspname='helmut_unit_diagnostic' OR (nspname='public' AND proname ~ '^local_unit_diagnostic_.*_v1$')),
  'ownTables',(SELECT jsonb_agg(c.relname ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='helmut_unit_diagnostic' AND c.relkind='r'));
COMMIT;"""
            catalog = json.loads(query(database, catalog_sql, 'NATIVE_CATALOG'))
            save('NATIVE_CATALOG.SAFE.json', catalog)
            result = {'pass': True, 'schema': 'helmut-local-unit-native-DDL-qualification/1', 'database': database,
                      'freshCopyFiles': 1714, 'originalPostrunPreserved': True, 'originalAuthRowUnchanged': True,
                      'originalJITRestoredFiles': len(restored.get('files', [])), 'DDLExecuted': True,
                      'nativeContractCatalogACLNegativeChecksPassed': True,
                      'nativeRoleAndStateCASQualified': False, 'nativeEndpointQualified': False,
                      'motorCalls': 0, 'providerCalls': 0, 'full500': False, 'unit60Qualified': False}
            if config.get('qualifyNativeBindings') is True:
                binding = load('local_unit_native_binding_preparation', config['bindingPreparationPin'])
                fresh_binding_result = binding.qualify(sys.modules[__name__], config, pg, catalog)
                result.update(fresh_binding_result)
        except BaseException as error:
            failure = type(error).__name__ + ': ' + str(error)[:200]
        finally:
            if pg and pg.poll() is None:
                pg.send_signal(signal.SIGINT)
                try:
                    codes['postgres'] = pg.wait(timeout=35)
                except subprocess.TimeoutExpired:
                    pg.kill()
                    codes['postgres'] = pg.wait(timeout=5)
                    failure = failure or 'postgres required emergency kill'
            elif pg:
                codes['postgres'] = pg.returncode
    finally:
        for row in LOGS:
            row['thread'].join(timeout=5)
            if not row['eof'] or row['overflow'] or row['error']:
                failure = failure or 'native child output EOF/budget failed'
            if row['label'] == 'POSTGRES' and b'database system is shut down' not in row['data']:
                failure = failure or 'native postgres clean shutdown marker absent'
            fd = os.open(OUT / (row['label'] + '.PRIVATE.log'), os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            with os.fdopen(fd, 'wb') as output:
                output.write(row['data'])
    original_preserved, sources_preserved = False, False
    final_phase, source_index, checked_count = 'raw-pin', None, 0
    try:
        actual = pin(config['raw']['path'])
        final_phase = 'raw-compare'
        assert actual == original_before
        original_preserved = True
        final_phase = 'source-pin'
        for source_index, item in enumerate(config['sources']):
            final_phase = 'source-pin'
            actual = pin(item['path'])
            final_phase = 'source-compare'
            assert actual == item
            checked_count += 1
        sources_preserved = True
    except BaseException as error:
        failure = failure or 'final source verification failed: ' + type(error).__name__
        capture_final_original_failure(error, final_phase, source_index, checked_count)
    accepted = failure is None and result is not None and codes.get('postgres') == 0 and all(p.poll() is not None for p in CHILDREN)
    requested = bool(config.get('executeNativeSingleUnit') and (OUT / 'MOTOR_ENTRY_REQUESTED.SAFE.json').exists())
    actual_motor_calls = (fresh_binding_result or {}).get('motorCalls', None if requested else 0)
    save('NATIVE_QUALIFICATION.SAFE.json', {**(result or {}), 'pass': accepted, 'failure': failure,
                                          'childExits': codes, 'allChildrenExited': all(p.poll() is not None for p in CHILDREN),
                                          'originalPostrunPreserved': original_preserved, 'motorCalls': actual_motor_calls,
                                          'motorEntryRequested': requested, 'full500': False,
                                          'originalSourcePinsUnchanged': sources_preserved})
    if not accepted:
        raise RuntimeError('native qualification failed; retained private logs')


if __name__ == '__main__':
    main()
