#!/usr/bin/env python3
"""Explicit scalar codec qualification; no original, workflow, or default run.

Root invokes --qualify-native-read-codec only after review. The fresh persistent
case contains a NEW empty PG17.6 cluster, never a POSTRUN extraction. Native
budget, kernel, supervisor and bounded process consumers are reused unchanged.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import stat
import sys
import time
import types

BIN = Path(__file__).resolve().parent
REPO = BIN.parent.parent
CONFIG = Path('/bench/CODEC_CONFIG.SAFE.json')
DATA = Path('/bench/PGDATA_CODEC_NOT_ORIGINAL')
RAM = Path('/ram')
RAM_OPTIONS = 'rw,nosuid,nodev,size=16777216,uid=1000,gid=1000,mode=0700'
MODE = 'helmut-native-read-registry-codec/1'
# Historical input remains evidence only, not an accepted alternative source.
HISTORICAL_READ_CLOSURE_SHA256 = 'c52a98aea31bff80cd48c6dcda8693cd623f2f3f3601494a8670c71ff971a620'
# The reviewed current source adds publication-read guards outside the scalar
# consumer. Its exact probe function/AST/716 SQL bytes are unchanged from72e4.
# Neither this source binding nor historical codec evidence qualifies an engine.
READ_CLOSURE_SHA256 = '12a8c501e0ac5370045e91be1f6839d92cf5521744b3da068d74c0e2efa52fbd'
REGISTRY_CODEC_SQL_SHA256 = '2c626f30a1b950e5ef1c816d26fcfb7aa68fdd0ff709a897e6b4130fc0a58e6c'


def need(ok, code):
    if not ok:
        raise RuntimeError('native-registry-codec-' + code)


def interrupted(signum, frame):
    raise InterruptedError('native-registry-codec-interrupted')


def source_bytes(path, expected=None, *, single_link=True):
    """Bootstrap FD pinning before importing any existing helper code."""
    p = Path(path)
    need(p.is_absolute() and p.resolve() == p, 'canonical-source')
    fd = os.open(p, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(fd)
        need(stat.S_ISREG(before.st_mode) and 0 < before.st_size <= 8 * 1024**2
             and before.st_nlink >= 1 and (not single_link or before.st_nlink == 1), 'source-file')
        blocks, size = [], 0
        while block := os.read(fd, 65536):
            size += len(block); need(size <= before.st_size, 'source-growth'); blocks.append(block)
        raw = b''.join(blocks)
        fields = ('st_dev', 'st_ino', 'st_mode', 'st_uid', 'st_gid', 'st_nlink', 'st_size', 'st_mtime_ns', 'st_ctime_ns')
        after, named = os.fstat(fd), p.lstat()
        need(size == before.st_size and all(getattr(before, k) == getattr(after, k) == getattr(named, k) for k in fields), 'source-drift')
        pin = {'path': str(p), 'bytes': size, 'sha256': hashlib.sha256(raw).hexdigest()}
        need(expected is None or expected == pin, 'source-pin')
        return raw, pin
    finally:
        os.close(fd)


def module(path, expected=None):
    raw, pin = source_bytes(path, expected)
    loaded = types.ModuleType('native_codec_' + Path(path).stem.replace('-', '_'))
    loaded.__file__ = str(path)
    exec(compile(raw, str(path), 'exec'), loaded.__dict__)
    return loaded, pin


def reviewed_read_closure_pin():
    _, pin = source_bytes(BIN / 'local-unit-native-read-closure.py')
    need(pin['sha256'] == READ_CLOSURE_SHA256, 'reviewed-current-read-codec-source')
    return pin


def codec_query(reader):
    sql = reader.registry_codec_probe_sql()
    need(type(sql) is str and hashlib.sha256(sql.encode('utf8')).hexdigest() == REGISTRY_CODEC_SQL_SHA256,
         'reviewed-scalar-codec-query')
    return sql


def unique_json(raw):
    need(type(raw) is bytes and len(raw) <= 1024**2, 'json-capture')
    def pairs(values):
        result = {}
        for k, v in values:
            need(k not in result, 'duplicate-json'); result[k] = v
        return result
    return json.loads(raw.decode('utf8', errors='strict'), object_pairs_hook=pairs,
                      parse_constant=lambda _: (_ for _ in ()).throw(ValueError('nonfinite')))


def validate_probe(value):
    need(type(value) is dict and set(value) == {'schema', 'serverVersionNum', 'oidJSON', 'oidJSONType', 'bigintJSON',
                                              'bigintJSONType', 'explicitProjectionMatches', 'maxOIDPreserved', 'qualifiedBooleanTypeMatches'}, 'probe-shape')
    need(value['schema'] == 'helmut-native-registry-json-codec/1'
         and type(value['serverVersionNum']) is int and value['serverVersionNum'] == 170006
         and type(value['oidJSON']) is str and value['oidJSON'] == '1' and value['oidJSONType'] == 'string'
         and type(value['bigintJSON']) is int and value['bigintJSON'] == 1 and value['bigintJSONType'] == 'number'
         and value['explicitProjectionMatches'] is True and value['maxOIDPreserved'] is True
         and value['qualifiedBooleanTypeMatches'] is True, 'actual-pg17-codec')
    return value


def container_arguments(config, mounts, config_hash):
    need(re.fullmatch('[a-f0-9]{64}', config_hash) is not None, 'config-hash')
    destinations = [str(t) for _, t, _ in mounts]
    need(len(destinations) == len(set(destinations)), 'duplicate-mount')
    need([(str(s), str(t)) for s, t, ro in mounts if not ro] == [(config['case'], '/bench')], 'only-persistent-case-writable')
    need(not any(str(t) == str(RAM) for _, t, _ in mounts), 'ram-not-a-bind')
    args = ['create', '--name', 'helmut-registry-codec-' + config['nonce'], '--network', 'none', '--read-only',
            '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--user', '1000:1000',
            '--cgroup-parent=/' + config['parent'], '--cgroupns', 'private', '--log-driver', 'none',
            '--shm-size', '16777216', '--tmpfs', '/ram:' + RAM_OPTIONS,
            '--entrypoint', config['python']]
    for source, target, readonly in mounts:
        args += ['--mount', 'type=bind,src=' + str(source) + ',dst=' + str(target) + (',readonly' if readonly else '')]
    return args + [config['runtime']['imageId'], '-I', '-S', '-B', str(BIN / Path(__file__).name),
                   '--codec-worker', '--config-sha256', config_hash]


def container_identity(supervisor, native, cid, config, mounts, config_hash):
    row = supervisor.identity(native.docker, cid, config['parent'], config['runtime'], mounts)
    h = row['HostConfig']
    need(h.get('CgroupnsMode') == 'private' and h.get('Tmpfs') == {'/ram': RAM_OPTIONS}
         and h.get('ShmSize') == 16777216 and row['Name'] == '/helmut-registry-codec-' + config['nonce'], 'container-closure')
    need(row['Config']['Entrypoint'] == [config['python']]
         and row['Config']['Cmd'] == ['-I', '-S', '-B', str(BIN / Path(__file__).name), '--codec-worker', '--config-sha256', config_hash], 'closed-worker-command')
    return row


def close_postgres(worker, pg, log):
    """Always reap known children and retain bounded logs; no clean-exit alias."""
    errors, code, sent = [], None, False
    if pg is not None:
        try:
            if pg.poll() is None:
                sent = True; pg.send_signal(signal.SIGINT); code = pg.wait(timeout=35)
            else:
                code = pg.returncode
        except BaseException:
            errors.append('postgres-clean-close-failed')
            try:
                pg.kill(); code = pg.wait(timeout=5)
            except BaseException:
                errors.append('postgres-emergency-close-failed')
    for child in worker.CHILDREN:
        if child.poll() is None:
            errors.append('other-child-was-live')
            try:
                child.terminate(); child.wait(timeout=3)
            except BaseException:
                try:
                    child.kill(); child.wait(timeout=3)
                except BaseException:
                    errors.append('child-close-failed')
    for row in worker.LOGS:
        row['thread'].join(timeout=5)
        if not row['eof'] or row['overflow'] or row['error'] or row['thread'].is_alive():
            errors.append('log-eof-or-bound-failed')
        try:
            fd = os.open(worker.OUT / (row['label'] + '.PRIVATE.log'), os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            with os.fdopen(fd, 'wb') as out:
                out.write(row['data'])
        except BaseException:
            errors.append('private-log-save-failed')
    clean = (sent and code == 0 and log is not None and log['eof'] and not log['overflow'] and log['error'] is None
             and b'database system is shut down' in log['data'] and all(c.poll() is not None for c in worker.CHILDREN) and not errors)
    return {'postgresExitCode': code, 'shutdownSIGINTSent': sent, 'cleanShutdown': clean,
            'allChildrenExited': all(c.poll() is not None for c in worker.CHILDREN), 'closureErrors': errors}


def worker_main(config_hash):
    need(os.getuid() == os.geteuid() == os.getgid() == os.getegid() == 1000, 'worker-uid')
    need(Path('/proc/self/cgroup').read_text() == '0::/\n', 'worker-cgroup')
    raw, _ = source_bytes(CONFIG)
    need(hashlib.sha256(raw).hexdigest() == config_hash, 'actual-config')
    config = unique_json(raw)
    need(config.get('schema') == MODE and config.get('persistentPGDATA') == str(DATA)
         and config.get('originalAuthMounted') is False and config.get('motorCalls') == 0 and config.get('full500') is False,
         'codec-only-configuration')
    for pin in config['sourcePins']:
        source_bytes(pin['path'], pin)
    worker, _ = module(config['workerHelperPin']['path'], config['workerHelperPin'])
    need(config['readClosurePin'] == reviewed_read_closure_pin(), 'worker-reviewed-read-codec-source')
    reader, _ = module(config['readClosurePin']['path'], config['readClosurePin'])
    signal.signal(signal.SIGTERM, worker.stop)
    signal.signal(signal.SIGINT, worker.stop)
    worker.LIBRARY_PATH = '/usr/lib/x86_64-linux-gnu'
    worker.PGDATA = DATA
    for row in config['runtimeBindings']:
        expected = {**row['source'], 'path': row['imagePath']}
        need(worker.pin(row['imagePath']) == expected, 'actual-mounted-runtime-pin')
    worker.guard(config)
    need(not DATA.exists() and not DATA.is_symlink() and DATA.parent == worker.OUT
         and worker.OUT.stat().st_dev != RAM.stat().st_dev, 'fresh-persistent-datadir')
    pg, log, result, failure = None, None, None, None
    try:
        worker.capture([str(worker.PGBIN / 'initdb'), '-D', str(DATA), '--no-locale', '--encoding=UTF8',
                        '--username=postgres', '--auth-local=trust', '--auth-host=reject'], 'CODEC_INITDB', timeout=40)
        need(DATA.is_dir() and DATA.resolve() == DATA and DATA.stat().st_dev == worker.OUT.stat().st_dev, 'datadir-on-case-filesystem')
        (RAM / 'socket').mkdir(mode=0o700)
        settings = {'listen_addresses': '', 'data_directory': str(DATA), 'hba_file': str(DATA / 'pg_hba.conf'),
                    'ident_file': str(DATA / 'pg_ident.conf'), 'shared_buffers': '8MB', 'work_mem': '1MB',
                    'max_connections': '8', 'max_worker_processes': '0', 'max_parallel_workers': '0',
                    'jit': 'off', 'autovacuum': 'off', 'logging_collector': 'off', 'log_statement': 'none',
                    'log_min_duration_statement': '-1', 'statement_timeout': '2s'}
        argv = [str(worker.PGBIN / 'postgres'), '-D', str(DATA), '-k', str(RAM / 'socket'), '-p', '5432']
        for key, value in settings.items():
            argv += ['-c', key + '=' + value]
        pg, log = worker.start_log(argv, 'POSTGRES_CODEC')
        deadline = time.monotonic() + 20
        while not (RAM / 'socket/.s.PGSQL.5432').exists() or b'database system is ready to accept connections' not in log['data']:
            worker.guard(config)
            need(pg.poll() is None and time.monotonic() < deadline, 'pg-ready-deadline')
            time.sleep(.05)
        worker.guard(config)
        sql = codec_query(reader)
        result = validate_probe(unique_json(worker.query('postgres', sql, 'READ_REGISTRY_CODEC').encode('utf8')))
        need(pg.poll() is None and len(worker.CHILDREN) == 3 and all(c.poll() == 0 for c in worker.CHILDREN if c is not pg), 'query-exit-and-capture')
        for pin in config['sourcePins']:
            source_bytes(pin['path'], pin)
        worker.guard(config)
    except BaseException as error:
        failure = type(error).__name__
    finally:
        closure = close_postgres(worker, pg, log)
    accepted = failure is None and result is not None and closure['cleanShutdown']
    worker.save('CODEC_WORKER_RESULT.SAFE.json', {'schema': MODE, 'codecPass': accepted, 'failureType': failure,
                'codec': result, **closure, 'queryExit0AndBothEOF': result is not None,
                'persistentDatadir': str(DATA), 'jit': False, 'originalAuthMounted': False,
                'sourcePrepareCalls': 0, 'readClosureInstallCalls': 0, 'motorCalls': 0, 'providerCalls': 0,
                'unit60Qualified': False, 'full500': False, 'full500ReserveQualified': False, 'ramPerformanceQualified': False})
    return 0 if accepted else 1


def close_host(supervisor, native, kernel, config, mounts, config_hash, cid, budget):
    """Owned-CID cleanup is attempted even if another close step fails."""
    errors, final = [], None
    if cid:
        try:
            row = container_identity(supervisor, native, cid, config, mounts, config_hash)
            if row['State']['Running']:
                native.docker(['stop', '--time', '35', cid], timeout=40)
            native.docker(['wait', cid], timeout=5)
        except BaseException:
            errors.append('workload-close-failed')
            try:
                native.docker(['kill', '--signal', 'KILL', cid], timeout=5)
                native.docker(['wait', cid], timeout=5)
            except BaseException:
                errors.append('workload-emergency-close-failed')
    try:
        closed = native.close_case_helpers(Path(config['case']), config['parent'], config['runtime'])
        need(closed['allKnownHelpersClosed'], 'budget-helper-close')
    except BaseException:
        errors.append('budget-helper-close-failed')
    try:
        group = native.parent_path(config['parent'])
        need((group.stat().st_dev, group.stat().st_ino) == (config['parentDevice'], config['parentInode']), 'final-group-identity')
        final = kernel.kernel_snapshot(config['parent'], require_empty=True)
        need(budget is not None, 'budget-not-confirmed')
        native.verify(config['parent'], budget)
        known = {h['id'] for h in budget['helpers'].values()} | ({cid} if cid else set())
        ids = native.docker(['ps', '--all', '--quiet']).stdout.split()
        rows = json.loads(native.docker(['inspect', *ids]).stdout) if ids else []
        actual = {r['Id'] for r in rows if r['HostConfig']['CgroupParent'] == '/' + config['parent']
                  or r['HostConfig']['CgroupParent'].startswith('/' + config['parent'] + '/')}
        need(actual == known, 'final-all-known-cids')
    except BaseException:
        errors.append('final-kernel-or-cid-closure-failed')
    return final, errors


def host_main():
    need(os.getuid() == os.geteuid() == os.getgid() == os.getegid() == 1000, 'source-operator-uid')
    supervisor, supervisor_pin = module(BIN / 'local-unit-native-supervisor.py')
    native, native_pin = module(BIN / 'native-memory-budget.py')
    kernel, kernel_pin = module(BIN / 'kernel-meter.py')
    need(supervisor.available() >= supervisor.FLOOR + 128 * 1024**2, 'persistent-capacity')
    runtime_path = supervisor.ARCH / 'native-budget-implementation-qualification-v2/runtime/RUNTIME.SAFE.json'
    raw, runtime_pin = source_bytes(runtime_path)
    original = unique_json(raw)
    original_source = supervisor.pin(original['sourcePin']['path'], single_link=False)
    current_source = supervisor.pin(BIN / 'native-memory-budget-helper.c')
    need(original_source == original['sourcePin'] and all(original_source[k] == current_source[k] for k in ('bytes', 'sha256')), 'original-budget-provenance')
    runtime = {**original, 'sourcePin': current_source}
    native.validate_runtime(runtime)
    metadata_paths = (supervisor.ARCH / 'native-auth-input-preparation/READONLY_RUNTIME_BINDINGS.SAFE.json',
                      supervisor.ARCH / 'auth-component-shell/SOURCE.SAFE.json',
                      supervisor.BASE / 'next-single-go-20261020/dio-component-python-compat-runtime/SOURCE_COMPAT_FILES.SAFE.json')
    metadata_pins = [source_bytes(path)[1] for path in metadata_paths]
    rows = supervisor.bindings()
    for pin in metadata_pins:
        source_bytes(pin['path'], pin)
    paths = {r['imagePath'] for r in rows}
    need(len(rows) >= 549 and sum(p.startswith('/usr/share/postgresql/17/') for p in paths) == 477
         and {'/etc/passwd', '/usr/lib/postgresql/17/bin/initdb', '/usr/lib/postgresql/17/bin/postgres', '/usr/lib/postgresql/17/bin/psql'} <= paths, 'actual-native-runtime-closure')
    nonce = os.urandom(16).hex()
    base = supervisor.OUT / 'registry-codec'
    base.mkdir(mode=0o700, exist_ok=True)
    need(base.resolve() == base and stat.S_ISDIR(base.lstat().st_mode) and not base.stat().st_mode & 0o077, 'private-case-base')
    case = base / nonce; case.mkdir(mode=0o700)
    pins = [supervisor_pin, native_pin, kernel_pin, runtime_pin, current_source, *metadata_pins]
    for p in (Path(__file__), BIN / 'local-unit-native-worker.py', BIN / 'local-unit-native-read-closure.py'):
        pins.append(source_bytes(p)[1])
    read_closure_pin = reviewed_read_closure_pin()
    config = {'schema': MODE, 'nonce': nonce, 'case': str(case), 'parent': 'helmut-meter-memorybudget-' + os.urandom(12).hex(),
              'runtime': runtime, 'originalRuntimePin': runtime_pin, 'helperSourcePathReboundOnly': True,
              'sourcePins': pins, 'workerHelperPin': source_bytes(BIN / 'local-unit-native-worker.py')[1],
              'readClosurePin': read_closure_pin,
              'runtimeBindings': rows,
              'python': str(supervisor.PYTHON / 'bin/python3.12'), 'persistentPGDATA': str(DATA),
              'originalAuthMounted': False, 'motorCalls': 0, 'full500': False}
    supervisor.save(case / 'STARTED.SAFE.json', config)
    budget, cid, failure, mounts, config_hash, worker_result = None, None, None, [], '', None
    started, samples = time.monotonic(), 0
    try:
        budget = native.start(case / 'native-memory-budget', config['parent'], runtime)
        group = native.parent_path(config['parent'])
        config.update(parentDevice=group.stat().st_dev, parentInode=group.stat().st_ino)
        supervisor.save(case / CONFIG.name, config)
        config_hash = supervisor.pin(case / CONFIG.name)['sha256']
        mounts = [(case, '/bench', False), (REPO, str(REPO), True), (supervisor.PYTHON, str(supervisor.PYTHON), True),
                  (group, '/owned-group', True)]
        mounts.extend((Path(p['path']), p['path'], True) for p in pins
                      if not Path(p['path']).is_relative_to(REPO))
        mounts.extend((Path(r['source']['path']), r['imagePath'], True) for r in rows)
        cid = native.docker(container_arguments(config, mounts, config_hash)).stdout.strip()
        need(re.fullmatch('[a-f0-9]{64}', cid) is not None, 'new-container-id')
        container_identity(supervisor, native, cid, config, mounts, config_hash)
        supervisor.save(case / 'CREATED.SAFE.json', {'id': cid, 'parent': config['parent']})
        native.docker(['start', cid])
        with (case / 'KERNEL_SAMPLES.SAFE.jsonl').open('x') as out:
            while True:
                row = container_identity(supervisor, native, cid, config, mounts, config_hash)
                snapshot = kernel.kernel_snapshot(config['parent']); snapshot['elapsedSeconds'] = time.monotonic() - started
                out.write(json.dumps(snapshot) + '\n'); out.flush(); samples += 1
                if not row['State']['Running']:
                    break
                need(time.monotonic() - started < 120 and supervisor.available() >= supervisor.FLOOR, 'bounded-control')
                time.sleep(.25)
        need(int(native.docker(['wait', cid], timeout=5).stdout.strip()) == 0 and not row['State']['OOMKilled'], 'actual-worker-exit')
        worker_result = unique_json(source_bytes(case / 'CODEC_WORKER_RESULT.SAFE.json')[0])
        need(worker_result.get('schema') == MODE and worker_result.get('codecPass') is True
             and worker_result.get('cleanShutdown') is True and worker_result.get('queryExit0AndBothEOF') is True, 'worker-proof')
        validate_probe(worker_result['codec'])
        for pin in pins:
            need(supervisor.pin(pin['path']) == pin, 'final-source-pin')
        for row in rows:
            need(supervisor.pin(row['source']['path']) == row['source'], 'final-runtime-pin')
        need(supervisor.pin(original['sourcePin']['path'], single_link=False) == original_source, 'original-helper-preserved')
    except BaseException as error:
        failure = type(error).__name__
    finally:
        final, errors = close_host(supervisor, native, kernel, config, mounts, config_hash, cid, budget)
    accepted = failure is None and not errors and final is not None and worker_result is not None
    receipt = {'schema': MODE, 'codecPass': accepted, 'case': str(case), 'failureType': failure, 'closureErrors': errors,
               'codec': worker_result['codec'] if worker_result else None, 'kernelFinal': final, 'samples': samples,
               'containerId': cid, 'parent': config['parent'], 'persistentPGDATA': str(case / DATA.name),
               'originalAuthMounted': False, 'originalPostrunRead': False, 'originalResourcesWritten': False,
               'sourcePrepareCalls': 0, 'readClosureInstallCalls': 0, 'motorCalls': 0, 'providerCalls': 0,
               'unit60Qualified': False, 'full500': False, 'full500ReserveQualified': False, 'ramPerformanceQualified': False}
    supervisor.save(case / 'RESULT.SAFE.json', receipt)
    print(json.dumps({'schema': MODE, 'codecPass': accepted, 'case': str(case), 'failureType': failure, 'closureErrors': errors,
                      'unit60Qualified': False, 'full500': False, 'full500ReserveQualified': False}))
    return 0 if accepted else 1


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group(required=True)
    modes.add_argument('--qualify-native-read-codec', action='store_true')
    modes.add_argument('--codec-worker', action='store_true', help=argparse.SUPPRESS)
    parser.add_argument('--config-sha256', help=argparse.SUPPRESS)
    args = parser.parse_args(argv)
    try:
        need(sys.flags.isolated and sys.flags.no_site and sys.flags.dont_write_bytecode, 'isolated-python-required')
        if args.codec_worker:
            need(type(args.config_sha256) is str and re.fullmatch('[a-f0-9]{64}', args.config_sha256), 'worker-fixed-config')
            return worker_main(args.config_sha256)
        need(args.config_sha256 is None, 'no-root-config-override')
        signal.signal(signal.SIGTERM, interrupted)
        signal.signal(signal.SIGINT, interrupted)
        return host_main()
    except BaseException as error:
        # Never print raw stderr, SQL, subprocess argv, config or exceptions.
        print(json.dumps({'schema': MODE, 'codecPass': False, 'failureType': type(error).__name__,
                          'unit60Qualified': False, 'full500': False, 'full500ReserveQualified': False}))
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
