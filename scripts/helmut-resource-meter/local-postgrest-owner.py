"""Inert on import. New LOCAL container-owned PostgREST lifecycle only.

The reviewed DB supervisor must produce DATABASE_CONFIG and its exact scope pin
AFTER its existing GO/claim checks. This module issues no GO or claim. Integration
is deliberately absent: without that new producer binding, --run rejects.
"""
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import socket
import stat
import subprocess
import sys
import threading
import time

ROOT = Path('/workspace/helmut-cpu-epoch-20261015')
DATABASE_CONFIG = Path('/meter-output/DATABASE_CONFIG.SAFE.json')
SCOPE_PATH = Path('/meter-output/LOCAL_POSTGREST_OWNER_SCOPE.SAFE.json')
STOP_PATH = Path('/meter-output/LOCAL_POSTGREST_OWNER_STOP.SAFE.json')
LOG_PATH = Path('/meter-output/LOCAL_POSTGREST_OWNER.PRIVATE.log')
STARTED_PATH = Path('/meter-output/LOCAL_POSTGREST_OWNER_STARTED.SAFE.json')
RESULT_PATH = Path('/meter-output/LOCAL_POSTGREST_OWNER_RESULT.SAFE.json')
BINARY_PATH = '/tmp/helmut-unit-fixture-postgrest-03693bea'
CONFIG_PATH = '/tmp/helmut-resource-fixture.conf'
BINARY_BYTES = 17309560
BINARY_SHA256 = '870a77f49508479bc87c5504b6b0c3715c7220926932d916b0d73952b297c617'
UPSTREAM_ROOT = Path('/workspace/helmut-ram-fix-20261020/combined-auth-baseline-comparison-20261020/preparation/upstream')
EVIDENCE_BYTES = 4139
EVIDENCE_SHA256 = '218646bd1d3e415348dedefd8b7920bd7e09bf293c94f407bf83ddbef7fd9884'
SOURCE_ROLES = ('local-postgrest-owner.py', 'database-supervisor.py', 'docker-broker.py',
                'isolation.py', 'connect-local500.py', 'process-runner.py', 'start-preflight.py')
ENV = {'PATH': '/usr/lib/postgresql/17/bin:/usr/bin:/bin', 'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8'}
UTC = datetime.timezone.utc
_issued, _nonces = {}, set()
_lock = threading.RLock()


def require(value, reason):
    if not value:
        raise ValueError(reason)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def regular(path, limit, *, private=False):
    p = Path(path)
    require(p.is_absolute() and p.resolve() == p and not p.is_symlink(), 'canonical file required')
    before = p.lstat()
    require(stat.S_ISREG(before.st_mode), 'regular file required before open')
    fd = os.open(p, os.O_RDONLY | os.O_NONBLOCK | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        first = os.fstat(fd)
        require(stat.S_ISREG(first.st_mode) and first.st_nlink == 1
                and first.st_ino == before.st_ino and first.st_dev == before.st_dev
                and 0 < first.st_size <= limit, 'bounded single-link regular file required')
        if private:
            require(stat.S_IMODE(first.st_mode) == 0o600 and first.st_uid == os.geteuid(), 'private owner file required')
        with os.fdopen(fd, 'rb', closefd=False) as f:
            raw = f.read(limit + 1)
        fields = ('st_dev', 'st_ino', 'st_size', 'st_mtime_ns', 'st_ctime_ns')
        identity = tuple(getattr(first, k) for k in fields)
        require(len(raw) == first.st_size and all(tuple(getattr(s, k) for k in fields) == identity
                for s in (os.fstat(fd), p.lstat())) and p.resolve() == p, 'file changed while reading')
        return raw, {'path': str(p), 'bytes': len(raw), 'sha256': sha(raw)}, identity
    finally:
        os.close(fd)


def pinned(pin, limit=20 * 1024 * 1024, *, private=False):
    require(type(pin) is dict and set(pin) == {'path', 'bytes', 'sha256'}
            and type(pin['bytes']) is int and pin['bytes'] > 0
            and type(pin['sha256']) is str and re.fullmatch('[a-f0-9]{64}', pin['sha256']), 'exact pin required')
    raw, actual, identity = regular(pin['path'], limit, private=private)
    require(actual == pin, 'pin contents differ')
    return raw, identity


def instant(value):
    require(type(value) is str and value.endswith('Z'), 'UTC instant required')
    result = datetime.datetime.fromisoformat(value[:-1] + '+00:00').timestamp()
    require(result > 0, 'positive UTC instant required')
    return result


def process_identity(child):
    require(type(child.pid) is int and child.pid > 1, 'direct child PID required')
    base = Path('/proc') / str(child.pid)
    require(os.readlink(base / 'ns/pid') == os.readlink('/proc/self/ns/pid'), 'child namespace differs')
    require(os.readlink(base / 'exe') == BINARY_PATH, 'child executable differs')
    st = os.stat(base / 'exe')
    binary = os.stat(BINARY_PATH)
    require((st.st_dev, st.st_ino) == (binary.st_dev, binary.st_ino), 'child executable inode differs')
    start = (base / 'stat').read_text().rsplit(')', 1)[1].split()[19]
    return {'pid': child.pid, 'startTicks': start, 'executableDevice': st.st_dev, 'executableInode': st.st_ino}


def container_scope():
    """Only the fixed private DB supervisor can supply the launch scope."""
    require(os.getpid() != 1 and re.fullmatch('[a-f0-9]{12}', socket.gethostname()), 'private container owner required')
    require(os.readlink('/proc/self/ns/pid') == os.readlink('/proc/1/ns/pid'), 'private supervisor namespace required')
    command = Path('/proc/1/cmdline').read_bytes().split(b'\0')
    require(len(command) == 4 and command[-1] == b''
            and command[0] == b'/opt/codex/runtimes/codex-primary-runtime/dependencies/python/bin/python'
            and command[1].decode() == str(ROOT / 'scripts/helmut-resource-meter/database-supervisor.py')
            and command[2].decode() == str(DATABASE_CONFIG), 'exact DB PID1 required')
    cfg_raw, cfg_pin, cfg_id = regular(DATABASE_CONFIG, 65536, private=True)
    cfg = json.loads(cfg_raw)
    require(cfg.get('scope') == 'owner-approved-local500-resources' and cfg.get('freshInitdbVolume') is True
            and cfg.get('stopFile') == '/meter-output/STOP_DATABASE'
            and cfg.get('finalFile') == '/meter-output/DATABASE_FINAL.SAFE.json', 'owned DB producer required')
    binding = cfg['localPostgrestOwner']
    require(set(binding) == {'scopePin', 'containerId', 'controllerInvocationId'}
            and re.fullmatch('[a-f0-9]{64}', binding['containerId'])
            and binding['containerId'].startswith(socket.gethostname())
            and re.fullmatch('[a-f0-9]{32}', binding['controllerInvocationId'])
            and binding['scopePin']['path'] == str(SCOPE_PATH), 'supervisor scope binding required')
    raw, scope_id = pinned(binding['scopePin'], 65536, private=True)
    return json.loads(raw), {'configPin': cfg_pin, 'configIdentity': cfg_id, 'scopeIdentity': scope_id, **binding}


def check_scope(scope, producer):
    keys = {'schema', 'production', 'automaticRetry', 'nonce', 'day', 'caseDirectory', 'targetDatabase', 'operationId',
            'containerId', 'controllerInvocationId', 'cgroupParent', 'createdAtUTC', 'launchByUTC', 'workEndsAtUTC',
            'closeByUTC', 'maximumLifecycleSeconds', 'binaryPin', 'configPin', 'templatePin', 'jwtSecretSHA256',
            'sourcePins', 'upstreamEvidencePin', 'upstreamSourcePins', 'logLimitBytes', 'waitSeconds', 'killWaitSeconds', 'drainWaitSeconds'}
    require(type(scope) is dict and set(scope) == keys and scope['schema'] == 'helmut-local-fullcase-postgrest-owner-scope/1'
            and scope['production'] is False and scope['automaticRetry'] is False, 'exact new local scope required')
    day = datetime.date.fromisoformat(scope['day'])
    require(day.isoformat() == scope['day'], 'canonical day required')
    case = Path(scope['caseDirectory'])
    suffix = case.name.removeprefix('attempt-')
    require(case.parent == Path('/workspace/helmut-parallel-20261015/wave20-resource-integration')
            and re.fullmatch('[a-f0-9]{12}', suffix), 'fresh local case shape required')
    require(scope['targetDatabase'] == 'helmut_resource_fixture_' + day.strftime('%Y%m%d') + '_' + suffix
            and scope['operationId'] == 'synthetik500-resources' + day.strftime('%d') + '-' + suffix
            and scope['cgroupParent'] == '/helmut-meter-resources' + day.strftime('%d') + '-' + suffix + '/database', 'case target binding differs')
    require(scope['containerId'] == producer['containerId'] and scope['controllerInvocationId'] == producer['controllerInvocationId']
            and re.fullmatch('[a-f0-9]{32}', scope['nonce']), 'case container/nonce binding differs')
    created, launch, work, close = map(instant, [scope[k] for k in ('createdAtUTC', 'launchByUTC', 'workEndsAtUTC', 'closeByUTC')])
    next_day = datetime.datetime.combine(day + datetime.timedelta(days=1), datetime.time(), UTC).timestamp()
    require(datetime.datetime.fromtimestamp(created, UTC).date() == day and created < launch <= created + 60
            and launch < work < next_day and work <= close <= work + 180
            and type(scope['maximumLifecycleSeconds']) is int and 0 < scope['maximumLifecycleSeconds'] <= 33000
            and close - created <= scope['maximumLifecycleSeconds'], 'bounded launch/work/close window required')
    for key, maximum in [('logLimitBytes', 16 * 1024 * 1024), ('waitSeconds', 30), ('killWaitSeconds', 10), ('drainWaitSeconds', 5)]:
        require(type(scope[key]) is int and 0 < scope[key] <= maximum, 'bounded owner limits required')
    require(scope['binaryPin'] == {'path': BINARY_PATH, 'bytes': BINARY_BYTES, 'sha256': BINARY_SHA256}
            and scope['configPin']['path'] == CONFIG_PATH, 'fixed reviewed executable/config required')
    require(re.fullmatch('[a-f0-9]{64}', scope['jwtSecretSHA256']) is not None, 'secret digest required')
    require([p['path'] for p in scope['sourcePins']] == [str(ROOT / 'scripts/helmut-resource-meter' / n) for n in SOURCE_ROLES], 'complete integration source roles required')
    require(scope['upstreamEvidencePin'] == {'path': str(UPSTREAM_ROOT / 'SOURCE_EVIDENCE.SAFE.json'), 'bytes': EVIDENCE_BYTES, 'sha256': EVIDENCE_SHA256}, 'reviewed upstream provenance required')
    return created, launch, work, close


def content(scope):
    executed = Path(__file__)
    require(executed.is_absolute() and executed.resolve() == executed and not executed.is_symlink()
            and str(executed) == scope['sourcePins'][0]['path'], 'actual owner self-source path differs')
    identities = []
    for p in [scope['binaryPin'], *scope['sourcePins']]:
        _, identity = pinned(p)
        identities.append(identity)
    raw, identity = pinned(scope['configPin'], 16384, private=True)
    identities.append(identity)
    template, template_id = pinned(scope['templatePin'], 16384)
    identities.append(template_id)
    def normalized(data, current):
        uri = re.findall(rb'^db-uri = "postgresql://authenticator@/([a-zA-Z0-9_]+)\?host=/var/run/postgresql"$', data, re.M)
        secret = re.findall(rb'^jwt-secret = "([a-f0-9]{64})"$', data, re.M)
        port = re.findall(rb'^server-port = ([0-9]+)$', data, re.M)
        require(len(uri) == len(secret) == len(port) == 1
                and data.count(b'server-host = "0.0.0.0"') == 1, 'exact isolated config fields required')
        if current:
            require(uri[0].decode() == scope['targetDatabase'] and port[0] == b'38414'
                    and sha(secret[0]) == scope['jwtSecretSHA256'], 'actual config target/secret binding differs')
        data = re.sub(rb'^db-uri = .*$', b'db-uri = "<BOUND_LOCAL_DATABASE_SOCKET>"', data, flags=re.M)
        data = re.sub(rb'^jwt-secret = .*$', b'jwt-secret = "<BOUND_SYNTHETIC_SECRET>"', data, flags=re.M)
        data = re.sub(rb'^server-port = .*$', b'server-port = <BOUND_LOCAL_PORT>', data, flags=re.M)
        return data, secret[0]
    actual, secret = normalized(raw, True)
    original, old_secret = normalized(template, False)
    require(actual == original and secret != old_secret, 'only bound target/port/fresh synthetic secret changes allowed')
    evidence, identity = pinned(scope['upstreamEvidencePin'])
    identities.append(identity)
    e = json.loads(evidence)
    require(e['postgrestCommit'] == '519615d5fbe3c19218baf0aeff8f5e3920d390e5'
            and e['ghcCommit'] == '8e9ea0f91305d9e4bb9df3d89f6a9e223ecb4dd3' and len(e['sources']) == 7, 'version-specific signal chain required')
    expected = [{'path': str(UPSTREAM_ROOT / p['localRelativePath']), 'bytes': p['bytes'], 'sha256': p['sha256']} for p in e['sources']]
    require(scope['upstreamSourcePins'] == expected and all(Path(p['path']).is_relative_to(UPSTREAM_ROOT) for p in expected), 'exact seven upstream sources required')
    for p in expected:
        _, identity = pinned(p)
        identities.append(identity)
    return identities


class Capability:
    __slots__ = ()


def qualify_scope():
    with _lock:
        return _qualify_scope()


def _qualify_scope():
    scope, producer = container_scope()
    created, launch, work, close = check_scope(scope, producer)
    wall, mono = time.time(), time.monotonic()
    require(created <= wall <= launch and not _nonces and not _issued, 'one fresh owner scope per interpreter required')
    identities = content(scope)
    cap = Capability()
    _nonces.add(scope['nonce'])
    _issued[id(cap)] = {'cap': cap, 'scope': scope, 'producer': producer, 'identities': identities,
        'launchDeadline': mono + launch - wall, 'workDeadline': mono + work - wall, 'deadline': mono + close - wall,
        'wall': wall, 'mono': mono, 'state': 'issued', 'child': None, 'errors': [], 'interrupts': 0}
    return cap


def entry(cap):
    with _lock:
        e = _issued.get(id(cap))
        require(e is not None and e['cap'] is cap, 'unknown or consumed owner capability')
        return e


def recheck(e):
    scope, producer = container_scope()
    require(canonical(scope) == canonical(e['scope']) and producer == e['producer']
            and content(scope) == e['identities'], 'bound owner scope or contents drifted')
    require(abs((time.time() - e['wall']) - (time.monotonic() - e['mono'])) <= 5, 'wall/monotonic clock drift')


def launch(cap):
    # Close cannot consume the capability between the launch claim and saving
    # the actual owned Popen/PID. A blocked/failed launch is never retried.
    with _lock:
        return _launch(cap)


def _launch(cap):
    e = entry(cap)
    require(e['state'] == 'issued', 'launch is single use')
    e['state'] = 'launch-attempted'  # failures never authorize another Popen
    require(time.monotonic() <= e['launchDeadline'], 'launch freshness expired')
    recheck(e)
    scope = e['scope']
    fd = os.open(LOG_PATH, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC, 0o600)
    e['log'] = os.fdopen(fd, 'wb')
    try:
        require(time.monotonic() <= e['launchDeadline']
                and abs((time.time() - e['wall']) - (time.monotonic() - e['mono'])) <= 5,
                'launch freshness changed during source validation')
        child = subprocess.Popen([BINARY_PATH, CONFIG_PATH], env=dict(ENV), stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, close_fds=True, start_new_session=False)
        e['child'] = child
        e['ownedPID'] = child.pid
        e['process'] = process_identity(child)
        e['drain'] = {'eof': False, 'overflow': False, 'errors': [], 'bytes': 0, 'retainedBytes': 0, 'tail': bytearray(), 'versionSeen': False}
        def drain():
            d = e['drain']
            try:
                while True:
                    data = child.stdout.read1(4096)
                    if not data:
                        d['eof'] = True
                        break
                    d['bytes'] += len(data)
                    d['tail'].extend(data)
                    del d['tail'][:-16384]
                    d['versionSeen'] |= re.search(rb'PostgREST 12\.2\.3(?:[^0-9.]|$)', d['tail']) is not None
                    keep = data[:max(0, scope['logLimitBytes'] - d['retainedBytes'])]
                    e['log'].write(keep)
                    d['retainedBytes'] += len(keep)
                    d['overflow'] |= d['bytes'] > scope['logLimitBytes']
            except BaseException as error:
                d['errors'].append(type(error).__name__)
        e['thread'] = threading.Thread(target=drain, daemon=True)
        e['thread'].start()
        e['state'] = 'running'
    except BaseException as error:
        e['errors'].append({'stage': 'launch', 'type': type(error).__name__})
        raise


def save_new(path, value):
    # The caller must require BOTH returned success and owner exit0, never a
    # partially committed positive file alone after an IO failure.
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC, 0o600)
    with os.fdopen(fd, 'wb') as f:
        f.write(canonical(value) + b'\n')
        f.flush()
        os.fsync(f.fileno())


def launch_record(cap):
    """Nonsecret launch identity, never a health, GO or full500 receipt."""
    e = entry(cap)
    require(e['state'] == 'running' and e['child'].poll() is None
            and process_identity(e['child']) == e['process'], 'live launched child required')
    return {'schema': 'helmut-local-postgrest-owner-started/1', 'scopePin': e['producer']['scopePin'],
        'nonce': e['scope']['nonce'], 'containerId': e['scope']['containerId'],
        'controllerInvocationId': e['scope']['controllerInvocationId'], 'operationId': e['scope']['operationId'],
        'processIdentity': dict(e['process']), 'binaryPin': dict(e['scope']['binaryPin']),
        'configPin': dict(e['scope']['configPin']), 'healthAccepted': False, 'executionAuthority': False,
        'production': False, 'full500Qualification': False, 'automaticRetry': False}


def close(cap, *, persist=None, reason='NORMAL_BOUND_STOP'):
    with _lock:
        e = entry(cap)
        _issued.pop(id(cap))  # consumed before IO, wait, signaling or persistence
    scope, child = e['scope'], e['child']
    r = {'schema': 'helmut-local-fullcase-postgrest-owner-result/1', 'pass': False,
        'scopePin': e['producer']['scopePin'], 'nonce': scope['nonce'], 'containerId': scope['containerId'],
        'operationId': scope['operationId'], 'reason': reason, 'production': False, 'full500Qualification': False,
        'executionAuthority': False, 'automaticRetry': False, 'reproducibleBuildVerified': False,
        'actualProcessSelfSignalTraced': False, 'returnCode': None, 'preStopReturnCode': None,
        'signalRequested': None, 'signalSent': False, 'reaped': False, 'timedOut': False, 'killSent': False,
        'policyVerified': False, 'eofObserved': False, 'drainEnded': False, 'logClosed': False,
        'acceptedExpectedTranslation': False, 'returnCodeClassification': 'UNQUALIFIED', 'errors': list(e['errors'])}
    def error(stage, ex):
        r['errors'].append({'stage': stage, 'type': type(ex).__name__})
    try:
        require(e['state'] == 'running' and time.monotonic() <= e['deadline'] and reason == 'NORMAL_BOUND_STOP', 'normal in-lifetime close required')
        recheck(e)
        require(child.args == [BINARY_PATH, CONFIG_PATH] and process_identity(child) == e['process'], 'same direct live Popen required')
        r['policyVerified'] = True
    except BaseException as ex:
        error('qualification', ex)
    if child is not None:
        try:
            require(child.pid == e['ownedPID'] and child.args == [BINARY_PATH, CONFIG_PATH], 'owned direct child identity differs')
            r['preStopReturnCode'] = child.poll()
            if r['preStopReturnCode'] is not None:
                r['returnCode'] = r['preStopReturnCode']
                r['reaped'] = True  # Popen.poll has already collected this status
            require(r['preStopReturnCode'] is None, 'pre-stop child already exited')
            r['signalRequested'] = 'SIGTERM'
            try:
                child.send_signal(signal.SIGTERM)
                r['signalSent'] = True
            except BaseException as ex:
                error('signal', ex)
            try:
                r['returnCode'] = child.wait(timeout=scope['waitSeconds'])
                r['reaped'] = True
            except BaseException as ex:
                r['timedOut'] = isinstance(ex, subprocess.TimeoutExpired)
                error('wait', ex)
                try:
                    child.kill()
                    r['killSent'] = True
                except BaseException as ex:
                    error('kill', ex)
                try:
                    r['returnCode'] = child.wait(timeout=scope['killWaitSeconds'])
                    r['reaped'] = True
                except BaseException as ex:
                    error('kill-wait', ex)
        except BaseException as ex:
            error('bound-child-close', ex)
    try:
        e['thread'].join(timeout=scope['drainWaitSeconds'])
        d = e['drain']
        r.update(eofObserved=d['eof'], drainEnded=not e['thread'].is_alive(), logOverflow=d['overflow'],
                 versionSeen=d['versionSeen'], observedLogBytes=d['bytes'], retainedLogBytes=d['retainedBytes'])
        require(r['eofObserved'] and r['drainEnded'] and not d['overflow'] and not d['errors'], 'complete bounded log EOF required')
    except BaseException as ex:
        error('drain', ex)
    try:
        e['log'].flush()
        os.fsync(e['log'].fileno())
        e['log'].close()
        r['logClosed'] = e['log'].closed
    except BaseException as ex:
        error('log-close', ex)
    clean = bool(r['policyVerified'] and r['signalSent'] and r['reaped'] and not r['timedOut']
        and not r['killSent'] and r['logClosed'] and r['eofObserved'] and r['drainEnded']
        and r.get('versionSeen') is True and not r['errors'] and not e['interrupts']
        and time.monotonic() <= e['deadline'])
    r['ownerInterrupts'] = e['interrupts']
    r['acceptedExpectedTranslation'] = bool(clean and type(r['returnCode']) is int and r['returnCode'] == -signal.SIGINT)
    r['pass'] = bool(clean and type(r['returnCode']) is int and (r['returnCode'] in (0, -signal.SIGTERM) or r['acceptedExpectedTranslation']))
    if r['pass']:
        r['returnCodeClassification'] = ('qualified-local-12.2.3-sigterm-userinterrupt-sigint' if r['acceptedExpectedTranslation'] else 'qualified-local-standard-signed-status')
    try:
        (persist or (lambda receipt: save_new(RESULT_PATH, receipt)))(r)
    except BaseException as ex:
        error('persist', ex)
        r['pass'] = r['acceptedExpectedTranslation'] = False
        r['returnCodeClassification'] = 'UNQUALIFIED'
    return r


def run():
    cap = qualify_scope()
    e = entry(cap)
    reason = 'LAUNCH_FAILED'
    def interrupted(signum, frame):
        e['interrupts'] += 1  # never interrupt the bounded cleanup itself
    old_handlers = {s: signal.signal(s, interrupted) for s in (signal.SIGTERM, signal.SIGINT)}
    try:
        launch(cap)
        save_new(STARTED_PATH, launch_record(cap))
        while True:
            require(not e['interrupts'], 'owner interrupted')
            require(e['child'].poll() is None, 'unexpected early PostgREST exit')
            require(abs((time.time() - e['wall']) - (time.monotonic() - e['mono'])) <= 5, 'wall/monotonic clock drift')
            require(time.monotonic() < e['workDeadline'], 'work deadline reached without bound stop')
            require(not e['drain']['overflow'] and not e['drain']['errors'], 'log failure')
            if STOP_PATH.exists():
                raw, _, _ = regular(STOP_PATH, 4096, private=True)
                require(json.loads(raw) == {'schema': 'helmut-local-postgrest-owner-stop/1',
                    'scopePin': e['producer']['scopePin'], 'nonce': e['scope']['nonce'],
                    'containerId': e['scope']['containerId'], 'reason': 'NORMAL_BOUND_STOP'}, 'bound stop request differs')
                reason = 'NORMAL_BOUND_STOP'
                break
            time.sleep(.05)
    except BaseException:
        reason = 'OWNER_WORK_OR_LAUNCH_FAILURE'
    try:
        return 0 if close(cap, reason=reason)['pass'] else 1
    finally:
        for signum, handler in old_handlers.items():
            signal.signal(signum, handler)


if __name__ == '__main__':
    try:
        require(sys.argv[1:] == ['--run'], 'explicit bound local owner action required')
        raise SystemExit(run())
    except Exception as ex:
        sys.stderr.write(type(ex).__name__ + '\n')
        raise SystemExit(1)
