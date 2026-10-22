"""Inert on import. New LOCAL container-owned PostgREST lifecycle only.

The reviewed DB supervisor must produce DATABASE_CONFIG and its exact scope pin
AFTER its existing GO/claim checks. This module issues no GO or claim. Without
the fresh optional supervisor producer binding, --run rejects.
"""
import datetime
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import selectors
import socket
import stat
import subprocess
import sys
import threading
import time

ROOT = Path('/workspace/helmut-cpu-epoch-20261015')
BACKEND_DIR = Path('/meter-output/local-postgrest-backend')
DATABASE_CONFIG = Path('/meter-output/DATABASE_CONFIG.SAFE.json')
HOST_BINDING = Path('/meter-output/LOCAL_POSTGREST_BACKEND_HOST_BINDING.SAFE.json')
KERNEL_BINDING = Path('/meter-output/LOCAL_POSTGREST_BACKEND_KERNEL_BINDING.SAFE.json')
PRODUCER_PATH = BACKEND_DIR / 'PRODUCER.SAFE.json'
REQUEST_PATH = BACKEND_DIR / 'REQUEST.PRIVATE.json'
ACK_PATH = BACKEND_DIR / 'START_ACK.SAFE.json'
SCOPE_PATH = BACKEND_DIR / 'SCOPE.SAFE.json'
STOP_PATH = BACKEND_DIR / 'STOP.SAFE.json'
LOG_PATH = BACKEND_DIR / 'output/OWNER.PRIVATE.log'
STARTED_PATH = BACKEND_DIR / 'output/STARTED.SAFE.json'
RESULT_PATH = BACKEND_DIR / 'output/RESULT.SAFE.json'
CGROUP_VIEW = Path('/local-postgrest-cgroup-parent')
ORIGINAL_BINARY_PATH = '/workspace/helmut-parallel-20261015/wave20-resource-integration/source-capture/postgrest-pinned'
BINARY_PATH = '/tmp/helmut-unit-fixture-postgrest-03693bea'
CONFIG_PATH = '/tmp/helmut-resource-fixture.conf'
BINARY_BYTES = 17309560
BINARY_SHA256 = '870a77f49508479bc87c5504b6b0c3715c7220926932d916b0d73952b297c617'
UPSTREAM_ROOT = Path('/workspace/helmut-ram-fix-20261020/combined-auth-baseline-comparison-20261020/preparation/upstream')
EVIDENCE_BYTES = 4139
EVIDENCE_SHA256 = '218646bd1d3e415348dedefd8b7920bd7e09bf293c94f407bf83ddbef7fd9884'
SOURCE_ROLES = ('local-postgrest-owner.py', 'database-supervisor.py', 'docker-broker.py',
                'isolation.py', 'connect-local500.py', 'process-runner.py', 'start-preflight.py',
                'finish-connection.py', 'start-input-checks.js')
ENV = {'PATH': '/usr/lib/postgresql/17/bin:/usr/bin:/bin', 'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8'}
UTC = datetime.timezone.utc
_issued, _nonces = {}, set()
_lock = threading.RLock()


def read_backend_plan(pin, *, case_directory, target_database, operation_id):
    """Read-only optional backend admission; never creates authority or a scope."""
    raw, _ = pinned(pin, 65536)
    p = json.loads(raw)
    keys = {'schema', 'mode', 'production', 'automaticRetry', 'day', 'caseDirectory', 'targetDatabase', 'operationId',
        'ownerGoPin', 'sourcePostgrestConfigPin', 'sourcePins', 'binaryPin', 'upstreamEvidencePin', 'upstreamSourcePins',
        'workEndsAtUTC', 'closeByUTC', 'maximumLifecycleSeconds', 'logLimitBytes', 'waitSeconds', 'killWaitSeconds',
        'drainWaitSeconds', 'resourceClaimPath'}
    require(set(p) == keys and p['schema'] == 'helmut-local-supervised-postgrest-backend-plan/1'
            and p['mode'] == 'supervised-owner-v1' and p['production'] is False and p['automaticRetry'] is False,
            'exact optional local backend plan required')
    require((p['caseDirectory'], p['targetDatabase'], p['operationId']) == (str(case_directory), target_database, operation_id), 'backend case binding differs')
    day = datetime.date.fromisoformat(p['day'])
    case = Path(p['caseDirectory']); suffix = case.name.removeprefix('attempt-')
    require(case.parent == Path('/workspace/helmut-parallel-20261015/wave20-resource-integration')
        and re.fullmatch('[a-f0-9]{12}', suffix)
        and p['targetDatabase'] == 'helmut_resource_fixture_' + day.strftime('%Y%m%d') + '_' + suffix
        and p['operationId'] == 'synthetik500-resources' + day.strftime('%d') + '-' + suffix, 'backend target/operation differs')
    require(p['binaryPin'] == {'path': ORIGINAL_BINARY_PATH, 'bytes': BINARY_BYTES, 'sha256': BINARY_SHA256}, 'backend binary differs')
    expected = [str(ROOT / 'scripts/helmut-resource-meter' / n) for n in SOURCE_ROLES] + [str(ROOT / 'scripts/helmut-resource-meter/local-postgrest-services.js')]
    require([q['path'] for q in p['sourcePins']] == expected, 'complete backend source closure required')
    for q in [p['binaryPin'], p['sourcePostgrestConfigPin'], p['ownerGoPin'], *p['sourcePins'], p['upstreamEvidencePin'], *p['upstreamSourcePins']]:
        pinned(q)
    require(p['upstreamEvidencePin'] == {'path': str(UPSTREAM_ROOT / 'SOURCE_EVIDENCE.SAFE.json'), 'bytes': EVIDENCE_BYTES, 'sha256': EVIDENCE_SHA256}, 'backend upstream provenance differs')
    evidence = json.loads(pinned(p['upstreamEvidencePin'])[0])
    expected_upstream = [{'path': str(UPSTREAM_ROOT / q['localRelativePath']), 'bytes': q['bytes'], 'sha256': q['sha256']} for q in evidence['sources']]
    require(len(expected_upstream) == 7 and p['upstreamSourcePins'] == expected_upstream, 'backend upstream closure differs')
    require(Path(p['resourceClaimPath']).parent == Path('/workspace/helmut-parallel-20261015/wave19-resource-meter')
            and Path(p['resourceClaimPath']).name.startswith('NEXT_RESOURCE' + day.strftime('%d') + '_V'), 'backend claim path differs')
    work, close = instant(p['workEndsAtUTC']), instant(p['closeByUTC'])
    require(datetime.datetime.fromtimestamp(work, UTC).date() == day and work <= close <= work + 180
            and type(p['maximumLifecycleSeconds']) is int and 0 < p['maximumLifecycleSeconds'] <= 33000, 'backend end bounds differ')
    for key, maximum in [('logLimitBytes', 16 * 1024 * 1024), ('waitSeconds', 30), ('killWaitSeconds', 10), ('drainWaitSeconds', 5)]:
        require(type(p[key]) is int and 0 < p[key] <= maximum, 'backend close bounds differ')
    return p


def require(value, reason):
    if not value:
        raise ValueError(reason)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def regular(path, limit, *, private=False, owner_uid=None):
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
            require(stat.S_IMODE(first.st_mode) == 0o600 and first.st_uid == (os.geteuid() if owner_uid is None else owner_uid), 'private owner file required')
        with os.fdopen(fd, 'rb', closefd=False) as f:
            raw = f.read(limit + 1)
        fields = ('st_dev', 'st_ino', 'st_size', 'st_mtime_ns', 'st_ctime_ns')
        identity = tuple(getattr(first, k) for k in fields)
        require(len(raw) == first.st_size and all(tuple(getattr(s, k) for k in fields) == identity
                for s in (os.fstat(fd), p.lstat())) and p.resolve() == p, 'file changed while reading')
        return raw, {'path': str(p), 'bytes': len(raw), 'sha256': sha(raw)}, identity
    finally:
        os.close(fd)


def pinned(pin, limit=20 * 1024 * 1024, *, private=False, owner_uid=None):
    require(type(pin) is dict and set(pin) == {'path', 'bytes', 'sha256'}
            and type(pin['bytes']) is int and pin['bytes'] > 0
            and type(pin['sha256']) is str and re.fullmatch('[a-f0-9]{64}', pin['sha256']), 'exact pin required')
    raw, actual, identity = regular(pin['path'], limit, private=private, owner_uid=owner_uid)
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
    parent = [line.split(':', 1)[1].strip() for line in (base / 'status').read_text().splitlines() if line.startswith('PPid:')]
    require(parent == [str(os.getpid())], 'actual direct child parent differs')
    require(os.readlink(base / 'exe') == BINARY_PATH, 'child executable differs')
    st = os.stat(base / 'exe')
    binary = os.stat(BINARY_PATH)
    require((st.st_dev, st.st_ino) == (binary.st_dev, binary.st_ino), 'child executable inode differs')
    start = (base / 'stat').read_text().rsplit(')', 1)[1].split()[19]
    return {'pid': child.pid, 'startTicks': start, 'executableDevice': st.st_dev, 'executableInode': st.st_ino}


def container_scope():
    """Only the fixed private DB supervisor can supply the launch scope."""
    require(os.getpid() != 1 and os.getppid() == 1 and re.fullmatch('[a-f0-9]{12}', socket.gethostname()), 'direct private DB PID1 owner required')
    command = Path('/proc/1/cmdline').read_bytes().split(b'\0')
    require(len(command) == 4 and command[-1] == b''
            and command[0] == b'/opt/codex/runtimes/codex-primary-runtime/dependencies/python/bin/python'
            and command[1].decode() == str(ROOT / 'scripts/helmut-resource-meter/database-supervisor.py')
            and command[2].decode() == str(DATABASE_CONFIG), 'exact DB PID1 required')
    cfg_raw, cfg_pin, cfg_id = regular(DATABASE_CONFIG, 65536, private=True)
    cfg = json.loads(cfg_raw)
    require(cfg.get('scope') == 'owner-approved-local500-resources' and cfg.get('freshInitdbVolume') is True
            and cfg.get('stopFile') == '/meter-output/control/STOP_DATABASE'
            and cfg.get('finalFile') == '/meter-output/DATABASE_FINAL.SAFE.json', 'owned DB producer required')
    producer_raw, producer_pin, producer_id = regular(PRODUCER_PATH, 65536)
    require(PRODUCER_PATH.stat().st_uid == 0 and stat.S_IMODE(PRODUCER_PATH.stat().st_mode) == 0o644, 'root-owned producer metadata required')
    binding = json.loads(producer_raw)
    require(binding['schema'] == 'helmut-local-postgrest-supervisor-producer/1'
            and binding['databaseConfigPin'] == cfg_pin and binding['localPostgrestBackendPlanPin'] == cfg['localPostgrestBackendPlanPin']
            and binding['pid1StartTicks'] == Path('/proc/1/stat').read_text().rsplit(')', 1)[1].split()[19]
            and re.fullmatch('[a-f0-9]{64}', binding['containerId'])
            and binding['containerId'].startswith(socket.gethostname())
            and re.fullmatch('[a-f0-9]{32}', binding['controllerInvocationId'])
            and binding['scopePin']['path'] == str(SCOPE_PATH), 'supervisor scope binding required')
    host = json.loads(pinned(binding['hostBindingPin'], 65536, private=True)[0])
    kernel = json.loads(pinned(binding['kernelBindingPin'], 65536, private=True)[0])
    require(host['containerId'] == kernel['containerId'] == binding['containerId']
            and host['privatePidMode'] == '' and binding['privatePidMode'] == ''
            and kernel['hostPIDStartTicks'] == binding['pid1StartTicks']
            and kernel['hostBindingPin'] == binding['hostBindingPin'], 'observed kernel container binding differs')
    group = CGROUP_VIEW / kernel['relativeToCommonParent']
    require(group.resolve() == group and group.is_relative_to(CGROUP_VIEW)
            and (group.stat().st_dev, group.stat().st_ino) == (kernel['cgroupDevice'], kernel['cgroupInode'])
            and {1, os.getpid()} <= {int(x) for x in (group / 'cgroup.procs').read_text().split()}, 'actual owner and PID1 kernel membership required')
    raw, scope_id = pinned(binding['scopePin'], 65536)
    require(SCOPE_PATH.stat().st_uid == 0 and stat.S_IMODE(SCOPE_PATH.stat().st_mode) == 0o644, 'root-owned scope metadata required')
    return json.loads(raw), {'configPin': cfg_pin, 'configIdentity': cfg_id, 'scopeIdentity': scope_id,
        'producerPin': producer_pin, 'producerIdentity': producer_id, **binding}


def check_scope(scope, producer):
    keys = {'schema', 'production', 'automaticRetry', 'nonce', 'day', 'caseDirectory', 'targetDatabase', 'operationId',
            'containerId', 'controllerInvocationId', 'cgroupParent', 'createdAtUTC', 'launchByUTC', 'workEndsAtUTC',
            'closeByUTC', 'maximumLifecycleSeconds', 'binaryPin', 'configPin', 'templatePin', 'jwtSecretSHA256',
            'sourcePins', 'upstreamEvidencePin', 'upstreamSourcePins', 'logLimitBytes', 'waitSeconds', 'killWaitSeconds', 'drainWaitSeconds', 'requestSHA256'}
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
    require(re.fullmatch('[a-f0-9]{64}', scope['requestSHA256']) is not None, 'request digest required')
    require([p['path'] for p in scope['sourcePins']] == [str(ROOT / 'scripts/helmut-resource-meter' / n) for n in SOURCE_ROLES], 'complete integration source roles required')
    require(scope['upstreamEvidencePin'] == {'path': str(UPSTREAM_ROOT / 'SOURCE_EVIDENCE.SAFE.json'), 'bytes': EVIDENCE_BYTES, 'sha256': EVIDENCE_SHA256}, 'reviewed upstream provenance required')
    return created, launch, work, close


def content(scope, *, expected_config_uid=None):
    executed = Path(__file__)
    require(executed.is_absolute() and executed.resolve() == executed and not executed.is_symlink()
            and str(executed) == scope['sourcePins'][0]['path'], 'actual owner self-source path differs')
    identities = []
    for p in [scope['binaryPin'], *scope['sourcePins']]:
        _, identity = pinned(p)
        identities.append(identity)
    raw, identity = pinned(scope['configPin'], 16384, private=True, owner_uid=expected_config_uid)
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


def publish_bytes(path, raw, *, mode=0o600):
    """Atomically expose a complete single-link file, without replacement.

    Linux renameat2 is required. Unsupported platforms fail closed; neither
    overwrite-rename nor a visible hardlink publication window is acceptable.
    A failed publication retains only its own hidden temporary evidence.
    """
    import ctypes
    import secrets
    path = Path(path)
    temporary = path.with_name('.' + path.name + '.' + secrets.token_hex(16) + '.pending')
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC, 0o600)
    with os.fdopen(fd, 'wb') as f:
        f.write(raw)
        os.fchmod(f.fileno(), mode)
        f.flush()
        os.fsync(f.fileno())
    libc = ctypes.CDLL(None, use_errno=True)
    rename = libc.renameat2
    rename.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
    rename.restype = ctypes.c_int
    if rename(-100, os.fsencode(temporary), -100, os.fsencode(path), 1) != 0:
        number = ctypes.get_errno()
        raise OSError(number, os.strerror(number), str(path))
    directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try: os.fsync(directory)
    finally: os.close(directory)


def save_new(path, value):
    # File success alone is never enough: callers also require owner exit0.
    publish_bytes(path, canonical(value) + b'\n')


def launch_record(cap):
    """Nonsecret launch identity, never a health, GO or full500 receipt."""
    e = entry(cap)
    require(e['state'] == 'running' and e['child'].poll() is None
            and process_identity(e['child']) == e['process'], 'live launched child required')
    return {'schema': 'helmut-local-postgrest-owner-started/1', 'scopePin': e['producer']['scopePin'],
        'requestSHA256': e['scope']['requestSHA256'], 'targetDatabase': e['scope']['targetDatabase'],
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
        'configPin': scope['configPin'], 'binaryPin': scope['binaryPin'], 'requestSHA256': scope['requestSHA256'],
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
    # Persistence (including filesystem flush) is inside the close lifetime.
    # A previously written positive file cannot compensate for owner exit1.
    try:
        require(time.monotonic() <= e['deadline'] and not e['interrupts']
            and abs((time.time() - e['wall']) - (time.monotonic() - e['mono'])) <= 5,
            'bound close qualification lost during persistence')
    except BaseException as ex:
        error('post-persist-qualification', ex)
        r['pass'] = r['acceptedExpectedTranslation'] = False
        r['returnCodeClassification'] = 'UNQUALIFIED'
    r['ownerInterrupts'] = e['interrupts']
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
                raw, _, _ = regular(STOP_PATH, 4096)
                require(STOP_PATH.stat().st_uid == 0 and stat.S_IMODE(STOP_PATH.stat().st_mode) == 0o644, 'root-owned stop metadata required')
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


def root_metadata(path, value):
    require(os.geteuid() == 0, 'DB PID1 root producer required')
    publish_bytes(path, canonical(value) + b'\n', mode=0o644)


def file_pin(path):
    return regular(path, 1024 * 1024)[1]


class SupervisedBackend:
    """DB PID1 only. Caches immutable inputs before any app can request start."""
    def __init__(self, cfg):
        require(os.getpid() == 1 and os.geteuid() == 0, 'private DB PID1 required')
        require(cfg['scope'] == 'owner-approved-local500-resources' and cfg['freshInitdbVolume'] is True, 'full local DB scope required')
        self.cfg_pin = file_pin(DATABASE_CONFIG)
        host_raw, self.host_pin, _ = regular(HOST_BINDING, 65536)
        self.host = json.loads(host_raw)
        require(self.host['schema'] == 'helmut-local-postgrest-backend-host-binding/1'
            and self.host['databaseConfigPin'] == self.cfg_pin
            and self.host['localPostgrestBackendPlanPin'] == cfg['localPostgrestBackendPlanPin']
            and self.host['kernelObservedBeforeStart'] is False
            and self.host['privatePidMode'] == ''
            and self.host['containerId'].startswith(socket.gethostname()), 'exact pre-start host binding required')
        plan_raw, _ = pinned(cfg['localPostgrestBackendPlanPin'], 65536)
        p = json.loads(plan_raw)
        self.plan = read_backend_plan(cfg['localPostgrestBackendPlanPin'], case_directory=p['caseDirectory'],
            target_database=p['targetDatabase'], operation_id=p['operationId'])
        require(self.host['configuredCgroupParent'] == '/helmut-meter-resources' + self.plan['day'][-2:] + '-'
            + Path(self.plan['caseDirectory']).name.removeprefix('attempt-') + '/database', 'configured cgroup differs')
        require(not BACKEND_DIR.exists(), 'backend output already exists; no retry')
        BACKEND_DIR.mkdir(mode=0o755)
        (BACKEND_DIR / 'output').mkdir(mode=0o700)
        os.chown(BACKEND_DIR / 'output', 1000, 1000)
        self.child = None
        self.request_consumed = False
        self.failure = None
        self.kernel_pin = None
        self.scope_pin = None
        self.request_hash = None

    def observe_kernel(self):
        if self.kernel_pin is not None or not KERNEL_BINDING.exists(): return
        raw, pin, _ = regular(KERNEL_BINDING, 65536)
        k = json.loads(raw)
        require(k['schema'] == 'helmut-local-postgrest-backend-kernel-binding/1'
            and k['hostBindingPin'] == self.host_pin and k['containerId'] == self.host['containerId']
            and k['hostPIDStartTicks'] == Path('/proc/1/stat').read_text().rsplit(')', 1)[1].split()[19], 'kernel binding differs')
        group = CGROUP_VIEW / k['relativeToCommonParent']
        require(group.resolve() == group and group.is_relative_to(CGROUP_VIEW)
            and (group.stat().st_dev, group.stat().st_ino) == (k['cgroupDevice'], k['cgroupInode'])
            and 1 in {int(x) for x in (group / 'cgroup.procs').read_text().split()}, 'actual DB PID1 kernel membership required')
        self.kernel_pin = pin
        root_metadata(BACKEND_DIR / 'SUPERVISOR_READY.SAFE.json', {'schema': 'helmut-local-postgrest-supervisor-ready/1',
            'hostBindingPin': self.host_pin, 'kernelBindingPin': pin, 'containerId': self.host['containerId'], 'production': False})

    def validate_request(self, r):
        keys = {'schema','production','automaticRetry','nonce','requestedAtUTC','day','caseDirectory','targetDatabase','operationId',
            'localPostgrestBackendPlanPin','ownerGoPin','activationResultPin','targetConfigPin','sourcePostgrestConfigPin',
            'derivedConfigBase64','jwtSecretSHA256','sourceBinding','sourcePins','globalClaimPin','recipeSHA256','appContainerId','controllerInvocationId'}
        p = self.plan
        require(set(r) == keys and r['schema'] == 'helmut-local-supervised-postgrest-service-request/1'
            and r['production'] is False and r['automaticRetry'] is False, 'exact service request required')
        require(self.kernel_pin is not None and file_pin(HOST_BINDING) == self.host_pin and file_pin(KERNEL_BINDING) == self.kernel_pin
            and file_pin(DATABASE_CONFIG) == self.cfg_pin, 'immutable producer inputs drifted')
        for key in ('day', 'caseDirectory', 'targetDatabase', 'operationId', 'ownerGoPin', 'sourcePostgrestConfigPin'):
            require(r[key] == p[key], 'service request plan field differs')
        require(r['localPostgrestBackendPlanPin'] == self.host['localPostgrestBackendPlanPin']
            and r['controllerInvocationId'] == self.host['controllerInvocationId']
            and re.fullmatch('[a-f0-9]{32}', r['nonce']) and 0 <= time.time() - instant(r['requestedAtUTC']) <= 10,
            'fresh service request and invocation required')
        require(type(r['sourceBinding']) is str and re.fullmatch('[a-f0-9]{64}', r['sourceBinding']), 'real source binding required')
        require(type(r['sourcePins']) is list and len({q['path'] for q in r['sourcePins']}) == len(r['sourcePins'])
            and all(q in r['sourcePins'] for q in p['sourcePins']), 'backend sources absent from real service source set')
        for q in p['sourcePins']: pinned(q)
        require(r['globalClaimPin']['path'] == p['resourceClaimPath'], 'actual fixed claim path required')
        claim = json.loads(pinned(r['globalClaimPin'], 65536)[0])
        reservation = json.loads(pinned(self.host['setupReservationPin'], 65536)[0])
        require(claim['schema'] == 'helmut-local-resource-attempt-claim/1' and claim['noAutomaticRetry'] is True
            and claim['freshOwnerGO'] == p['ownerGoPin']
            and claim['independentMeterAcceptance'] == self.host['independentMeterAcceptancePin']
            and claim['containerId'] == r['appContainerId'] and re.fullmatch('[a-f0-9]{64}', r['appContainerId'])
            and claim['recipeSHA256'] == r['recipeSHA256'] and re.fullmatch('[a-f0-9]{64}', r['recipeSHA256'])
            and reservation['controllerInvocationId'] == self.host['controllerInvocationId']
            and reservation['freshOwnerGO'] == p['ownerGoPin'], 'real GO/claim/reservation binding differs')
        owner = json.loads(pinned(p['ownerGoPin'], 65536)[0])
        require(owner['schema'] == 'helmut-owner-local-fixture-go/1' and owner['production'] is False
            and owner['syntheticProfiles'] == 500 and owner['allowDispose'] is False
            and owner['targetDatabase'] == p['targetDatabase'], 'existing real local owner GO required')
        n = Path(p['caseDirectory']) / 'native-end-preparation'
        require(r['activationResultPin']['path'] == str(n / 'LOCAL_ACTIVATION_RESULT.SAFE.json')
            and r['targetConfigPin']['path'] == str(n / 'LOCAL_NEW_FIXTURE.PRIVATE.json'), 'exact fresh activation output paths required')
        activated = json.loads(pinned(r['activationResultPin'], 65536)[0])
        target = json.loads(pinned(r['targetConfigPin'], 65536)[0])
        require(activated['pass'] is True and activated['target'] == p['targetDatabase']
            and activated['actualInactive'] == activated['actualActiveAfter'] == 500
            and activated['ownerGoPin'] == p['ownerGoPin'] and activated['sourceProfileHashUnchanged'] is True
            and activated['newTargetProfileFachHashUnchanged'] is True
            and target['database'] == p['targetDatabase'] and target['container'] == self.host['containerName']
            and target['ownerGoPin'] == p['ownerGoPin'], 'real gated activation receipt differs')
        derived = base64.b64decode(r['derivedConfigBase64'], validate=True)
        require(0 < len(derived) <= 16384 and re.fullmatch('[a-f0-9]{64}', r['jwtSecretSHA256']), 'bounded derived config required')
        return derived

    def tick(self):
        self.observe_kernel()
        if self.child is not None:
            require(self.child.poll() is None, 'owner exited before normal DB stop')
            if STARTED_PATH.exists() and not ACK_PATH.exists():
                started = json.loads(regular(STARTED_PATH, 65536, private=False)[0])
                require(started['scopePin'] == self.scope_pin and started['requestSHA256'] == self.request_hash
                    and started['containerId'] == self.host['containerId'], 'owner start identity differs')
                root_metadata(ACK_PATH, {'schema': 'helmut-local-supervised-postgrest-start-ack/1',
                    'requestSHA256': self.request_hash, 'started': started})
            return
        if self.request_consumed or not REQUEST_PATH.exists(): return
        self.request_consumed = True  # before parsing or producing any child
        raw, request_pin, _ = regular(REQUEST_PATH, 1024 * 1024)
        self.request_hash = sha(raw)
        root_metadata(BACKEND_DIR / 'REQUEST_CONSUMED.SAFE.json', {'requestPin': request_pin, 'production': False, 'automaticRetry': False})
        r = json.loads(raw)
        config = self.validate_request(r)
        publish_bytes(CONFIG_PATH, config)
        os.chown(CONFIG_PATH, 1000, 1000)
        now = time.time()
        stamp = lambda t: datetime.datetime.fromtimestamp(t, UTC).isoformat().replace('+00:00', 'Z')
        p = self.plan
        scope = {key: p[key] for key in ('production','automaticRetry','day','caseDirectory','targetDatabase','operationId',
            'workEndsAtUTC','closeByUTC','maximumLifecycleSeconds','logLimitBytes','waitSeconds','killWaitSeconds','drainWaitSeconds',
            'upstreamEvidencePin','upstreamSourcePins')}
        scope.update(schema='helmut-local-fullcase-postgrest-owner-scope/1', nonce=r['nonce'], containerId=self.host['containerId'],
            controllerInvocationId=self.host['controllerInvocationId'], cgroupParent=self.host['configuredCgroupParent'],
            createdAtUTC=stamp(now), launchByUTC=stamp(now + 10), binaryPin={'path': BINARY_PATH, 'bytes': BINARY_BYTES, 'sha256': BINARY_SHA256},
            configPin=file_pin(Path(CONFIG_PATH)), templatePin=p['sourcePostgrestConfigPin'], jwtSecretSHA256=r['jwtSecretSHA256'],
            sourcePins=p['sourcePins'][:len(SOURCE_ROLES)], requestSHA256=self.request_hash)
        producer = {'schema': 'helmut-local-postgrest-supervisor-producer/1', 'databaseConfigPin': self.cfg_pin,
            'localPostgrestBackendPlanPin': self.host['localPostgrestBackendPlanPin'], 'hostBindingPin': self.host_pin,
            'kernelBindingPin': self.kernel_pin, 'containerId': self.host['containerId'], 'controllerInvocationId': self.host['controllerInvocationId'],
            'privatePidMode': self.host['privatePidMode'], 'pid1StartTicks': Path('/proc/1/stat').read_text().rsplit(')', 1)[1].split()[19]}
        check_scope(scope, producer)
        # UID1000 must be able to read the same inputs before Popen. The root
        # producer validates identical content now; owner repeats after drop.
        content(scope, expected_config_uid=1000)
        root_metadata(SCOPE_PATH, scope)
        self.scope = scope
        self.scope_pin = file_pin(SCOPE_PATH)
        producer['scopePin'] = self.scope_pin
        root_metadata(PRODUCER_PATH, producer)
        self.child = subprocess.Popen(['/opt/codex/runtimes/codex-primary-runtime/dependencies/python/bin/python',
            str(ROOT / 'scripts/helmut-resource-meter/local-postgrest-owner.py'), '--run'],
            stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            env=dict(ENV), user=1000, group=1000, extra_groups=[], close_fds=True)

    def finish(self):
        result = {'enabled': True, 'pass': False, 'ownerExitCode': None, 'failure': self.failure, 'production': False}
        if self.child is None:
            result['failure'] = result['failure'] or 'OWNER_NEVER_STARTED'
            return result
        result.update(scopePin=self.scope_pin, nonce=self.scope['nonce'], configPin=self.scope['configPin'],
            containerId=self.host['containerId'], operationId=self.plan['operationId'], requestSHA256=self.request_hash)
        try:
            root_metadata(STOP_PATH, {'schema': 'helmut-local-postgrest-owner-stop/1', 'scopePin': self.scope_pin,
                'nonce': json.loads(regular(SCOPE_PATH, 65536)[0])['nonce'], 'containerId': self.host['containerId'], 'reason': 'NORMAL_BOUND_STOP'})
            result['ownerExitCode'] = self.child.wait(timeout=50)
            receipt = json.loads(regular(RESULT_PATH, 65536)[0])
            result['resultPin'] = file_pin(RESULT_PATH)
            result['pass'] = bool(self.failure is None and result['ownerExitCode'] == 0 and receipt['pass'] is True
                and receipt['scopePin'] == self.scope_pin and receipt['containerId'] == self.host['containerId']
                and receipt['operationId'] == self.plan['operationId'] and receipt['nonce'] == self.scope['nonce']
                and receipt['configPin'] == self.scope['configPin'] and receipt['requestSHA256'] == self.request_hash
                and ACK_PATH.exists())
        except BaseException as ex:
            result['failure'] = type(ex).__name__
            try:
                if self.child.poll() is None: self.child.send_signal(signal.SIGTERM)
                result['ownerExitCode'] = self.child.wait(timeout=10)
            except BaseException:
                try: self.child.kill(); result['ownerExitCode'] = self.child.wait(timeout=5)
                except BaseException: pass
        return result


def submit_request():
    require(os.geteuid() == 0 and os.getpid() != 1 and BACKEND_DIR.is_dir(), 'live DB supervisor backend required')
    require(Path('/proc/1/cmdline').read_bytes().split(b'\0')[1].decode() == str(ROOT / 'scripts/helmut-resource-meter/database-supervisor.py'), 'fixed DB PID1 required')
    chunks, count, until = [], 0, time.monotonic() + 10
    selector = selectors.DefaultSelector()
    os.set_blocking(sys.stdin.fileno(), False)
    selector.register(sys.stdin.fileno(), selectors.EVENT_READ)
    try:
        while True:
            remaining = until - time.monotonic()
            require(remaining > 0 and selector.select(remaining), 'request input deadline exceeded')
            data = os.read(sys.stdin.fileno(), min(65536, 1024 * 1024 + 1 - count))
            if not data: break
            chunks.append(data); count += len(data)
            require(count <= 1024 * 1024, 'request input too large')
    finally: selector.close()
    raw = b''.join(chunks)
    require(0 < len(raw) <= 1024 * 1024, 'bounded request required')
    parsed = json.loads(raw)
    require(type(parsed) is dict and parsed.get('schema') == 'helmut-local-supervised-postgrest-service-request/1', 'service request schema required')
    publish_bytes(REQUEST_PATH, raw)
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        if ACK_PATH.exists():
            ack = json.loads(regular(ACK_PATH, 65536)[0])
            require(ack['requestSHA256'] == sha(raw), 'request acknowledgement differs')
            return ack
        require(not (BACKEND_DIR / 'FAILURE.SAFE.json').exists(), 'supervisor rejected service request')
        time.sleep(.02)
    raise TimeoutError('owner start acknowledgement missing')


if __name__ == '__main__':
    try:
        require(sys.argv[1:] == ['--run'], 'explicit bound local owner action required')
        raise SystemExit(run())
    except Exception as ex:
        sys.stderr.write(type(ex).__name__ + '\n')
        raise SystemExit(1)
