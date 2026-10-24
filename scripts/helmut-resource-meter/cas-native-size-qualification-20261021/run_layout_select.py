#!/usr/bin/env python3
"""SOURCE ONLY until Root review/adoption: one synthetic PG17 SELECT, no Auth paths."""
import argparse
import hashlib
import json
import os
import re
import selectors
import stat
import subprocess
import threading
import time
from pathlib import Path

BASE = Path(__file__).resolve().parent
ROOT = Path('/workspace/helmut-ram-fix-20261020/cas-native-size-20261021')
CASES = ROOT / 'cases'
IMAGE = 'sha256:34e72f77a5fa0728d44b75766cdfdb1851aea196b3ba6c4fb9242f5d339a678b'
BINDINGS = {'path': '/workspace/helmut-ram-fix-20261020/architecture-correction-20261020/native-auth-input-preparation/READONLY_RUNTIME_BINDINGS.SAFE.json', 'bytes': 207733, 'sha256': '71e661eeaa3a71c74a7dc9aa7d5cf6568e12f728365f2a3b97fa08c1e8076475'}
SHELL = {'path': '/workspace/helmut-ram-fix-20261020/architecture-correction-20261020/auth-component-shell/original-sh', 'bytes': 125640, 'sha256': 'f5adb8bf0100ed0f8c7782ca5f92814e9229525a4b4e0d401cf3bea09ac960a6'}
NATIVE = '/usr/lib/postgresql/17/bin/'
FLOOR = 8 * 1024**3
DISK_ADMISSION = 256 * 1024**2
EVIDENCE_CAP = 1024**2
ENV = os.environ.copy()
for key in ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH']:
    ENV.pop(key, None)
DOCKER = ['docker', '--host=unix:///var/run/docker.sock']


def require(ok, why):
    if not ok:
        raise RuntimeError(why)


def canonical(path):
    p = Path(path)
    require(p.is_absolute() and p.resolve() == p, 'canonical path required')
    require(all(not x.is_symlink() for x in [p, *p.parents]), 'symlink ancestor')
    return p


def pin(path):
    p = canonical(path); before = p.lstat()
    require(stat.S_ISREG(before.st_mode) and before.st_nlink == 1, 'exclusive regular input')
    h = hashlib.sha256()
    with p.open('rb') as stream:
        while block := stream.read(1024**2):
            h.update(block)
    after = p.lstat()
    require((before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns) ==
            (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns), 'input changed')
    return {'path': str(p), 'bytes': before.st_size, 'sha256': h.hexdigest()}


def read_pin(item):
    require(pin(item['path']) == item, 'input pin drift')
    return json.loads(Path(item['path']).read_text())


def floor(extra=0):
    s = os.statvfs('/workspace')
    require(s.f_bavail * s.f_frsize >= FLOOR + extra, '8GiB host floor/admission')


class CapturedCommandFailure(RuntimeError):
    def __init__(self, exit_code, stdout, stderr):
        super().__init__('Docker command exit ' + str(exit_code))
        self.exit_code = exit_code
        self.stdout = stdout
        self.stderr = stderr


def capture(args, timeout=30, cap=65536):
    """Bounded Docker CLI capture; never invokes a host PostgreSQL executable."""
    child = subprocess.Popen(DOCKER + args, env=ENV, stdin=subprocess.DEVNULL,
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    sel = selectors.DefaultSelector(); values = [bytearray(), bytearray()]
    sel.register(child.stdout, selectors.EVENT_READ, 0); sel.register(child.stderr, selectors.EVENT_READ, 1)
    until = time.monotonic() + timeout
    try:
        while sel.get_map():
            require(time.monotonic() < until, 'Docker command deadline')
            for key, _ in sel.select(.05):
                block = os.read(key.fileobj.fileno(), 8192)
                if not block:
                    sel.unregister(key.fileobj); continue
                require(sum(map(len, values)) + len(block) <= cap, 'Docker command capture cap')
                values[key.data].extend(block)
        code = child.wait(timeout=max(.1, until-time.monotonic()))
        if code != 0:
            raise CapturedCommandFailure(code, bytes(values[0]), bytes(values[1]))
        return bytes(values[0]), bytes(values[1])
    finally:
        sel.close()
        if child.poll() is None:
            child.kill(); child.wait(timeout=5)
        child.stdout.close(); child.stderr.close()


def save(case, name, data):
    require('/' not in name and case.parent == CASES, 'fixed own evidence path')
    if not isinstance(data, bytes):
        data = (json.dumps(data, indent=2, sort_keys=True) + '\n').encode()
    used = sum(x.stat().st_size for x in case.iterdir() if x.is_file())
    require(used + len(data) <= EVIDENCE_CAP, '1MiB non-PGDATA evidence cap')
    floor(len(data) + 4096)
    fd = os.open(case/name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(data); stream.flush(); os.fsync(stream.fileno())


def bindings():
    value = read_pin(BINDINGS)
    require(len(value['bindings']) == 548, 'original548 runtime bindings')
    rows = list(value['bindings']) + [{'imagePath': '/bin/sh', 'source': SHELL, 'readonly': True}]
    require(len({x['imagePath'] for x in rows}) == 549, 'unique549 runtime destinations')
    roots = [Path('/workspace/helmut-ram-fix-20261020/next-single-go-20261020/postrun-native-position-export/runtime-root'),
             Path('/workspace/helmut-ram-fix-20261020/architecture-correction-20261020/native-auth-input-preparation/runtime-overlay')]
    for row in rows:
        source = canonical(row['source']['path']); target = Path(row['imagePath'])
        require(row['readonly'] is True and target.is_absolute() and '..' not in target.parts and
                not target.is_relative_to('/layout') and not target.is_relative_to('/probe'), 'fixed readonly runtime path')
        require(row['source'] == SHELL or any(source.is_relative_to(r) for r in roots), 'runtime sources only')
        require(pin(source) == row['source'], 'actual original runtime bytes drift')
    return rows


def main(adoption_path):
    require(os.getuid() == os.getgid() == 1000 and BASE.stat().st_uid == 1000 and
            stat.S_IMODE(BASE.stat().st_mode) == 0o700, 'own source preparation only')
    require(adoption_path == BASE/'ROOT_LAYOUT_ADOPTION.PRIVATE.json', 'fixed fresh Root adoption path')
    adoption_meta = adoption_path.lstat()
    require(adoption_meta.st_uid == 1000 and stat.S_IMODE(adoption_meta.st_mode) == 0o600,
            'private Root adoption required')
    adoption = read_pin(pin(adoption_path)); now = time.time()
    require(adoption['schema'] == 'helmut-synthetic-pg17-layout-root-adoption/1' and
            adoption['action'] == 'ROOT RUN ONE SYNTHETIC PG17 LAYOUT SELECT' and
            adoption['scriptPin'] == pin(Path(__file__).resolve()) and
            adoption['runtimeBindingsPin'] == BINDINGS and adoption['shellPin'] == SHELL and
            adoption['independentSourceReviewAccepted'] is True and
            adoption['singleConstantReadOnlySelectReviewed'] is True and
            adoption['full500'] is False and adoption['production'] is False and
            re.fullmatch('[a-f0-9]{24}', adoption['nonce']) and
            type(adoption['atUnix']) in (int, float) and type(adoption['expiresAtUnix']) in (int, float) and
            0 <= now-adoption['atUnix'] <= 300 and now <= adoption['expiresAtUnix'] <= adoption['atUnix']+300,
            'fresh reviewed exact source/runtime/SQL Root adoption')
    nonce = adoption['nonce']; case = canonical(CASES/('layout-'+nonce))
    require(adoption['case'] == str(case) and not case.exists(), 'new synthetic case only; never replay')
    sql = adoption['sqlPin']; sql_path = canonical(sql['path'])
    require(sql_path.is_relative_to(ROOT) and not sql_path.is_relative_to(CASES) and
            re.fullmatch('[/A-Za-z0-9_.-]+', str(sql_path)) and
            type(sql['bytes']) is int and 0 < sql['bytes'] <= 16384 and pin(sql_path) == sql,
            'reviewed small synthetic SELECT pin')
    rows = bindings(); floor(DISK_ADMISSION + EVIDENCE_CAP)
    require(time.time() <= adoption['expiresAtUnix'], 'adoption expired before case creation')
    CASES.mkdir(mode=0o700, exist_ok=True); canonical(CASES)
    require(CASES.stat().st_uid == 1000 and stat.S_IMODE(CASES.stat().st_mode) == 0o700, 'own cases parent')
    case.mkdir(mode=0o700); disk = case/'disk'; disk.mkdir(mode=0o700)
    socket = disk/'socket'; socket.mkdir(mode=0o700)
    require(not (disk/'pgdata').exists() and set(disk.iterdir()) == {socket}, 'fresh empty synthetic PGDATA')
    save(case, 'ROOT_ADOPTION_PIN.SAFE.json', pin(adoption_path))
    save(case, 'LAYOUT_ONCE_CLAIM.SAFE.json', {'nonce': nonce, 'scriptPin': adoption['scriptPin'],
        'sqlPin': sql, 'runtimeBindingsPin': BINDINGS, 'sourceOrOriginalPGDATA': False, 'automaticRetry': False})
    started = time.monotonic(); until = started + 120
    created = []; server = None; reader = None; log = bytearray(); eof = threading.Event()
    ready = threading.Event(); log_error = threading.Event(); passed = False; error = None; forced = []; closing = False
    result = {'schema': 'helmut-synthetic-pg17-layout-execution/1', 'status': 'FAIL',
        'layoutCorrectnessAcceptedByRunner': False, 'full500': False, 'production': False,
        'memorySavingClaimed': False, 'authCASCalls': 0, 'projectionEnabled': False, 'sqlInvocations': 0}

    def remaining(seconds):
        return max(.1, min(seconds, until-time.monotonic()))

    def inspect(cid, expected_args):
        raw, _ = capture(['inspect', cid], 15 if closing else remaining(15), 512*1024)
        actual = json.loads(raw); require(len(actual) == 1, 'one exact owned container')
        row = actual[0]; h = row['HostConfig']
        mounts = sorted((m['Source'], m['Destination'], m['RW']) for m in row['Mounts'])
        wanted = sorted([(x['source']['path'], x['imagePath'], False) for x in rows] +
                        [(str(disk), '/layout', True), (str(sql_path), '/probe/layout-select.sql', False)])
        require(row['Id'] == cid and row['Image'] == IMAGE and h['NetworkMode'] == 'none' and
                h['ReadonlyRootfs'] is True and not h['Privileged'] and row['Config']['User'] == '1000:1000' and
                h['Memory'] == h['MemorySwap'] == 1547997184 and h['PidsLimit'] == 64 and
                h['CapDrop'] == ['ALL'] and 'no-new-privileges' in h['SecurityOpt'] and
                mounts == wanted and row['Config']['Entrypoint'] == [expected_args[0]] and
                row['Config']['Cmd'] == expected_args[1:], 'exact owned native container policy/mounts/argv')
        return row

    def create(role, argv):
        require(time.monotonic() < until and time.time() <= adoption['expiresAtUnix'], 'fresh creation deadline')
        floor(2*1024**2)
        name = 'helmut-jsonb-layout-'+role+'-'+nonce
        args = ['create', '--pull', 'never', '--name', name, '--network', 'none', '--read-only', '--cap-drop', 'ALL',
            '--security-opt', 'no-new-privileges', '--user', '1000:1000', '--cgroupns', 'private',
            '--memory', '1547997184', '--memory-swap', '1547997184', '--pids-limit', '64',
            '--log-driver', 'none', '--shm-size', '16777216', '--entrypoint', argv[0],
            '--env', 'LANG=C.UTF-8', '--env', 'LC_ALL=C.UTF-8', '--env', 'HOME=/layout',
            '--env', 'TMPDIR=/layout', '--env', 'PATH=/usr/lib/postgresql/17/bin:/usr/bin:/bin',
            '--env', 'PGHOSTADDR=', '--env', 'PGSERVICEFILE=/dev/null',
            '--env', 'PGOPTIONS=']
        for row in rows:
            args += ['--mount', 'type=bind,src='+row['source']['path']+',dst='+row['imagePath']+',readonly']
        args += ['--mount', 'type=bind,src='+str(disk)+',dst=/layout', '--mount',
                 'type=bind,src='+str(sql_path)+',dst=/probe/layout-select.sql,readonly', IMAGE, *argv[1:]]
        raw, _ = capture(args, remaining(20)); cid = raw.decode().strip()
        require(re.fullmatch('[a-f0-9]{64}', cid), 'exact newly created CID')
        created.append((cid, argv)); row = inspect(cid, argv)
        require(row['Name'] == '/'+name and row['State']['Status'] == 'created' and row['State']['Pid'] == 0,
                'never start an old or running container')
        save(case, role.upper()+'_CREATED.SAFE.json', row)
        return cid

    def closed(cid, argv):
        row = inspect(cid, argv); s = row['State']
        require(s['Status'] == 'exited' and not s['Running'] and s['Pid'] == 0 and s['ExitCode'] == 0 and
                not s['OOMKilled'] and not s['Paused'] and not s['Restarting'] and not s['Dead'] and not s['Error'],
                'native container must close normally with0')
        return s

    try:
        init_args = [NATIVE+'initdb', '-D', '/layout/pgdata', '--username=layout_probe',
                     '--no-locale', '--encoding=UTF8', '--auth=trust']
        init_cid = create('init', init_args)
        out, err = capture(['start', '--attach', init_cid], remaining(45))
        save(case, 'INITDB.stdout.txt', out); save(case, 'INITDB.stderr.txt', err)
        result['initdbClosure'] = closed(init_cid, init_args)
        pg_args = [NATIVE+'postgres', '-D', '/layout/pgdata', '-k', '/layout/socket',
            '-c', 'listen_addresses=', '-c', 'unix_socket_permissions=0700',
            '-c', 'default_transaction_read_only=on', '-c', 'statement_timeout=5s',
            '-c', 'lock_timeout=1s', '-c', 'idle_in_transaction_session_timeout=5s',
            '-c', 'logging_collector=off', '-c', 'log_statement=none', '-c', 'log_min_duration_statement=-1']
        pg_cid = create('server', pg_args)
        server = subprocess.Popen(DOCKER+['start', '--attach', pg_cid], env=ENV, stdin=subprocess.DEVNULL,
                                  stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        def drain():
            tail = b''
            try:
                while block := os.read(server.stdout.fileno(), 4096):
                    if len(log)+len(block) <= 65536: log.extend(block)
                    else: log_error.set()
                    tail = (tail+block)[-4096:]
                    if b'database system is ready to accept connections' in tail: ready.set()
            except BaseException:
                log_error.set()
            finally:
                eof.set()
        reader = threading.Thread(target=drain, daemon=True); reader.start(); wait_until = min(until, time.monotonic()+30)
        while not ready.is_set():
            require(server.poll() is None and time.monotonic() < wait_until and not log_error.is_set(), 'bounded PG readiness/EOF')
            time.sleep(.02)
        require(inspect(pg_cid, pg_args)['State']['Running'] is True, 'owned PG must be running')
        require(set(disk.iterdir()) == {disk/'pgdata', socket} and not (disk/'.pgpass').exists(),
                'fresh HOME/layout without password file or foreign state')
        require(pin(sql_path) == sql, 'SQL drift before sole invocation')
        result['sqlInvocations'] = 1
        out, err = capture(['exec', '--user', '1000:1000', pg_cid, NATIVE+'psql', '-X', '-qAt', '-w',
            '-h', '/layout/socket', '-p', '5432', '-U', 'layout_probe', '-d', 'postgres',
            '-v', 'ON_ERROR_STOP=1', '-f', '/probe/layout-select.sql'], remaining(30), 4096)
        save(case, 'SQL_COMMAND.stdout.txt', out)
        save(case, 'SQL_COMMAND.stderr.txt', err)
        require(not err and out.strip() and len(out.splitlines()) == 1 and isinstance(json.loads(out), dict),
                'one bounded JSON SELECT row; no retry')
        save(case, 'LAYOUT_SELECT.stdout.json', out)
        result['sqlOutputBytes'] = len(out); result['sqlOutputSHA256'] = hashlib.sha256(out).hexdigest()
        capture(['exec', '--user', '1000:1000', pg_cid, NATIVE+'pg_ctl', '-D', '/layout/pgdata',
                 'stop', '-m', 'fast', '-w', '-t', '15'], remaining(20))
        require(server.wait(timeout=remaining(20)) == 0, 'PG attach external exit0')
        reader.join(timeout=5)
        require(eof.is_set() and not reader.is_alive() and not log_error.is_set(), 'complete bounded PG log EOF')
        result['postgresClosure'] = closed(pg_cid, pg_args)
        require(time.monotonic() < until, 'whole native work120s')
        passed = True
    except BaseException as caught:
        error = type(caught).__name__+': '+str(caught)[:160]
        if isinstance(caught, CapturedCommandFailure):
            save(case, 'FAILED_COMMAND.stdout.txt', caught.stdout)
            save(case, 'FAILED_COMMAND.stderr.txt', caught.stderr)
            result['failedCommandExitCode'] = caught.exit_code
            result['failedCommandCaptureBytes'] = len(caught.stdout) + len(caught.stderr)
    finally:
        closing = True
        for cid, argv in reversed(created):
            try:
                row = inspect(cid, argv)
                if row['State']['Running']:
                    forced.append(cid); capture(['stop', '--time', '15', cid], 20)
                require(not inspect(cid, argv)['State']['Running'], 'owned native container still running')
            except BaseException as caught:
                passed = False; error = 'CLOSURE_UNKNOWN: '+type(caught).__name__
        if server is not None:
            try:
                server.wait(timeout=20)
                if reader is not None: reader.join(timeout=5)
                require(eof.is_set() and not reader.is_alive() and not log_error.is_set(), 'PG log closure incomplete')
            except BaseException:
                passed = False; error = 'PG_LOG_EOF_OR_EXTERNAL_CLOSURE_UNKNOWN'
            finally:
                server.stdout.close()
        save(case, 'POSTGRES.log.txt', bytes(log))
        passed = passed and time.monotonic()-started <= 120
        result.update({'status': 'NATIVE_SELECT_COMPLETED_NOT_LAYOUT_ACCEPTED' if passed and not forced else 'FAIL',
            'error': error, 'forcedStops': forced, 'wholeWorkSeconds': time.monotonic()-started,
            'keptContainerIDs': [cid for cid, _ in created], 'syntheticPGDATAKept': True,
            'existingContainerIDsCommanded': [], 'sourcePGDATAMounted': False,
            'PGLogEOF': eof.is_set() if server else None,
            'runtimeBindingsPin': BINDINGS, 'shellPin': SHELL, 'sqlPin': sql, 'scriptPin': adoption['scriptPin']})
        encoded = (json.dumps(result, sort_keys=True)+'\n').encode()
        require(len(encoded) <= 4096, 'bounded worker receipt4096B')
        save(case, 'ACTUAL_EXECUTION.SAFE.json', encoded)
        print(encoded.decode(), end='')
    return 0 if passed and not forced else 1


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root-adoption', type=Path, required=True)
    args = parser.parse_args()
    raise SystemExit(main(args.root_adoption))
