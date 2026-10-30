"""One real synthetic restore/export connection in the existing GitHub runner.

Explicit opt-in only. Reuses the existing tiny SQL fixture, parent, IPC, Watch,
owned native workers, public-recipient seal and second-cluster recovery. No
original admission is bypassed: this separate fixture cannot accept originals,
full backup completeness, authenticated remote readback, End500 or Mock500.
"""
import sys
sys.dont_write_bytecode = True

import hashlib
import importlib.util
import json
import multiprocessing
import os
from pathlib import Path
import re
import stat
import subprocess
import time
import uuid

HERE = Path(__file__).absolute().parent
SCRIPT, REPO = Path(__file__).absolute(), HERE.parents[1]
IMAGE = 'postgres:17.6-bookworm@sha256:f3bd19c606e442c3d7bdfa8002e03fe260a1023351e0ea4598032022b68dd6e3'
NODE_SHA = 'bc17c508ffeed0ec622934f9b7fa72f8e78da65350e63c3eceb56fa688aa5e12'
MAX_BYTES, WALL = 8 * 1024 * 1024, 300
ACTIONS = ('restore-create', 'restore-roles', 'restore-render', 'restore-apply', 'restore-check',
           'backup-before', 'backup-dump', 'backup-roles', 'backup-after')
PHASES = {'binding', 'parent', 'service', 'resources', 'fixture', 'container-start', 'readiness',
          'fixture-dump', 'native-restore', 'backup-export', 'backup-freeze', 'backup-selection',
          'backup-seal', 'backup-local-readback', 'backup-recovery', 'closure'}
PHASES |= set(ACTIONS)


def load(name):
    spec = importlib.util.spec_from_file_location('w15_minimal_' + name, HERE / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def need(value):
    if not value:
        raise RuntimeError('SYNTHETIC_NATIVE_CONNECTION_REJECTED')


def write(path, raw):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(raw)
        stream.flush()
        os.fsync(stream.fileno())


def pin(path):
    raw = path.read_bytes()
    need(len(raw) <= 256 * 1024 * 1024)
    return {'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}


def failure_details(work, phase, error):
    """Closed categories only, never child text, SQL, arguments or file bodies."""
    result = {'phase': phase if phase in PHASES else 'service', 'category': 'CHECK_REJECTED',
              'nativeReturnCode': None, 'nativeSignal': None, 'sqlState': None}
    if isinstance(error, PermissionError):
        result['category'] = 'FILESYSTEM_ACCESS_DENIED'
    elif isinstance(error, FileNotFoundError):
        result['category'] = 'FILESYSTEM_ENTRY_MISSING'
    elif isinstance(error, subprocess.TimeoutExpired):
        result['category'] = 'COMMAND_TIMEOUT'
    if work is None:
        return result
    for action in ACTIONS:
        folder = 'restore' if action.startswith('restore-') else 'final-backup'
        root = work / 'state' / folder
        journal = root / (action + '.lifecycle.PRIVATE.jsonl')
        receipt = root / (action + '.SAFE.json')
        if not journal.is_file():
            continue
        try:
            rows = [json.loads(line) for line in journal.read_bytes()[:65536].splitlines()]
            terminal = [r for r in rows if r.get('event') == 'owned-child-exit']
            accepted = receipt.is_file() and json.loads(receipt.read_bytes()[:65536]).get('status') in (
                'PASS_OWNED_ISOLATED_RESTORE_STEP', 'PASS_OWNED_DATABASE_EXPORT_STEP')
            if accepted:
                continue
            result['phase'] = action
            if terminal:
                row = terminal[0]
                code, sig = row.get('code'), row.get('signal')
                if type(code) is int and -255 <= code <= 255:
                    result['nativeReturnCode'] = code
                if sig in ('SIGTERM', 'SIGKILL', 'SIGINT', 'SIGSEGV', 'SIGABRT', 'SIGBUS'):
                    result['nativeSignal'] = sig
            raw = (root / (action + '.PRIVATE.stderr')).read_bytes()[:65536]
            for pattern, category in ((b'Permission denied', 'FILESYSTEM_ACCESS_DENIED'),
                    (b'Connection refused', 'POSTGRES_CONNECTION_REFUSED'),
                    (b'does not exist', 'POSTGRES_OBJECT_MISSING'),
                    (b'already exists', 'POSTGRES_OBJECT_EXISTS'),
                    (b'statement timeout', 'POSTGRES_STATEMENT_TIMEOUT'),
                    (b'No space left on device', 'FILESYSTEM_NO_SPACE')):
                if pattern in raw:
                    result['category'] = category
                    break
            break
        except (OSError, ValueError, TypeError):
            break
    return result


def call(argv, *, raw=None, timeout=25):
    result = subprocess.run(argv, input=raw, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            close_fds=True, timeout=timeout, env={'PATH': os.defpath, 'LANG': 'C.UTF-8'})
    need(result.returncode == 0 and len(result.stdout) <= MAX_BYTES and len(result.stderr) <= MAX_BYTES)
    return result.stdout


def owned_containers(ctx, image):
    p = load('runner_parent')
    names = call(p.DOCKER + ['ps', '-a', '--filter', 'label=helmut.w15.run=' + ctx['runId'],
                            '--format', '{{.ID}}']).decode().splitlines()
    result = []
    for name in names:
        info = json.loads(call(p.DOCKER + ['inspect', name]))[0]
        if info['HostConfig']['CgroupParent'] != p.names(ctx)[0]:
            continue
        need(info['Image'] == image and info['Config']['Labels']['helmut.w15.commit'] == ctx['exactCommit']
             and info['Config']['Labels']['helmut.w15.scope'] in (
                 'synthetic-native-connection-only', 'independent-backup-recovery-only'))
        result.append(info)
    return result


def stop_containers(ctx, image):
    p = load('runner_parent')
    count = 0
    for info in owned_containers(ctx, image):
        if info['State']['Running']:
            call(p.DOCKER + ['stop', '--time', '5', info['Id']], timeout=15)
        final = json.loads(call(p.DOCKER + ['inspect', info['Id']]))[0]
        need(final['Id'] == info['Id'] and final['State']['Running'] is False
             and final['State']['Pid'] == 0 and final['State']['OOMKilled'] is False
             and final['State']['ExitCode'] == 0)
        count += 1
    return count


def stop_service(ctx):
    p = load('runner_parent')
    unit, service, _ = p.names(ctx)
    def read():
        raw = call(['/usr/bin/systemctl', 'show', service, '--property=Slice', '--property=LoadState',
                    '--property=ActiveState', '--property=MainPID'])
        value = dict(line.split('=', 1) for line in raw.decode().splitlines())
        need(set(value) == {'Slice', 'LoadState', 'ActiveState', 'MainPID'})
        return value
    value = read()
    if value['LoadState'] != 'not-found':
        need(value['Slice'] == unit)
        call(['/usr/bin/systemctl', 'stop', service], timeout=20)
        value = read()
    need(value['ActiveState'] in ('inactive', 'failed') and value['MainPID'] == '0')


def worker(ctx, root, node, image):
    phase, watch, resources, work, failure = 'resources', None, None, None, None
    result = {'schema': 'helmut-w15-real-synthetic-connection/1', 'status': 'FAIL',
        'restoreSteps': 0, 'exportActions': 0, 'sealVerified': False, 'secondRestoreVerified': False,
        'originalDataRead': False, 'originalAdmissionExercised': False,
        'fullBackupCollectionAccepted': False, 'authenticatedRemoteReadbackAccepted': False,
        'historicalCauseProven': False, 'end500Acceptance': False, 'mock500Acceptance': False,
        'executionAuthority': False, 'providerCalls': 0, 'profileActivations': 0,
        'newStorageUSD': '0', 'memory': None, 'containerStop': 'UNKNOWN', 'watchStop': 'UNKNOWN'}
    try:
        need(os.getuid() == os.getgid() == 1000)
        spec = importlib.util.spec_from_file_location('w15_minimal_forward', REPO / 'scripts/synthetik-500-w15-memory-forward.py')
        forward = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(forward)
        m = forward.M
        resources = forward.open_common_resources(ctx)
        root.mkdir(mode=0o700)
        # Public tools are copied into the UID1000 fixture tree. The real runner
        # also stages tools; checkout/setup-node ownership is not the worker's.
        staged_node = root / 'node'
        write(staged_node, node.read_bytes())
        os.chmod(staged_node, 0o700)
        node = staged_node
        public_key = root / 'receiver-public.asc'
        write(public_key, (REPO / 'docs/betrieb/belege/w15-end500-transfer-20261029/receiver-public.asc').read_bytes())
        work = root / 'work'
        work.mkdir(mode=0o700)
        for name in ('state', 'pgdata', 'inputs', 'selection', 'rollback'):
            (root / name if name in ('selection', 'rollback') else work / name).mkdir(mode=0o700)
        forward.WORK = m.WORK = work
        forward.CONTAINER = m.CONTAINER = 'w15-end500-' + ctx['runId'] + '-' + uuid.UUID(ctx['nonce']).hex
        m.IMAGE = image
        backup = load('restore_backup')
        context = {'schema': 'helmut-w15-backup-context/1', 'scope': 'ISOLATED_GITHUB_END500_BACKUP_ONLY',
            **ctx, 'inputManifestSHA': hashlib.sha256(b'EXISTING_TINY_SYNTHETIC_SQL_ONLY').hexdigest(),
            'recipientFingerprint': backup.FINGERPRINT, 'executionAuthority': False}
        roles, dump = work / 'inputs/roles.PRIVATE.sql', work / 'inputs/input.PRIVATE.dump'
        write(roles, b'-- Existing tiny synthetic fixture; no additional roles.\n')
        write(dump, b'')
        stop = REPO / 'scripts/fixtures/w15-owned-process-stop.js'
        mounts = {m.BASE + '/state': work / 'state', m.BASE + '/node': node,
                  m.BASE + '/roles.PRIVATE.sql': roles, m.BASE + '/input.PRIVATE.dump': dump,
                  m.BASE + '/app/scripts/fixtures/w15-owned-process-stop.js': stop,
                  '/var/lib/postgresql/data': work / 'pgdata'}
        argv = []
        for target, source in mounts.items():
            readonly = target not in (m.BASE + '/state', '/var/lib/postgresql/data')
            argv += ['--mount', 'type=bind,src=' + str(source) + ',dst=' + target + (',readonly' if readonly else '')]
        labels = {'helmut.w15.run': ctx['runId'], 'helmut.w15.commit': ctx['exactCommit'],
                  'helmut.w15.scope': 'synthetic-native-connection-only'}
        for key, value in labels.items():
            argv += ['--label', key + '=' + value]
        phase = 'container-start'
        m.docker('create', '--name', m.CONTAINER, '--pull=never', '--network=none', '--restart=no',
            '--memory=2560000000', '--memory-swap=2560000000', '--cgroup-parent=' + resources.unit,
            *argv, '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', image, 'postgres',
            '-c', 'max_wal_size=128MB', '-c', 'work_mem=32MB', '-c', 'autovacuum_naptime=10s')
        info = json.loads(m.docker('inspect', m.CONTAINER))[0]
        need(info['Image'] == image and info['Config']['Labels'] == labels)
        m.docker('start', info['Id'])
        info = json.loads(m.docker('inspect', info['Id']))[0]
        resources.check_pid(info['State']['Pid'], info['Id'])
        watch = forward.Watch(resources.path)
        watch.common_resources = resources
        watch.sample()
        watch.thread.start()
        phase = 'readiness'
        for _ in range(100):
            watch.sample()
            ready = subprocess.run(m.DOCKER + ['exec', info['Id'], 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '--timeout=1'],
                env=m.ENV, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=5)
            if ready.returncode == 0:
                break
            time.sleep(.2)
        need(ready.returncode == 0)
        m.docker('exec', info['Id'], 'chmod', '700', m.BASE)
        m.docker('exec', info['Id'], 'chown', '1000:1000', m.BASE)
        phase = 'fixture'
        source_db = 'w15_minimal_source'
        def sql(database, value):
            return m.docker('exec', '-i', m.CONTAINER, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1',
                            '-U', 'postgres', '-d', database, '-f', '-', input=value.encode())
        sql('postgres', 'create database ' + source_db + ';')
        sql(source_db, load('test_backup_snapshot_postgres').SETUP)
        phase = 'fixture-dump'
        raw = m.docker('exec', m.CONTAINER, 'pg_dump', '-U', 'postgres', '--format=custom', '--dbname=' + source_db)
        need(5 < len(raw) <= MAX_BYTES and raw[:5] == b'PGDMP')
        with dump.open('r+b') as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
        sql('postgres', 'drop database ' + source_db + ';')
        watch.backup_runner = backup.T.O.OwnedBackupRunner(watch, m, base=m.BASE,
            container=m.CONTAINER, database=m.DB, scope='end500-restore')
        phase = 'native-restore'
        restored = backup.T.restore_owned(m, watch, run_owned=watch.backup_runner.run_owned)
        result['restoreSteps'] = restored['steps']
        watch.backup_runner = backup.T.O.OwnedBackupRunner(watch, m, base=m.BASE,
            container=m.CONTAINER, database=m.DB, scope='end500-backup')
        phase = 'backup-export'
        exported = backup.export_restore_database(context, expected_context=context, work=work,
            container=m.CONTAINER, database=m.DB, supervisor=watch, run_owned=watch.backup_runner.run_owned)
        result['exportActions'] = len(exported['pins'])
        phase = 'backup-freeze'
        need(stop_containers(ctx, image) == 1)
        watch.sample()
        watch.stop()
        need(watch.failure is None and watch.stop_failure is None and not watch.thread.is_alive()
             and not watch.reporter.is_alive())
        result['watchStop'] = 'PASS'
        phase = 'backup-selection'
        # A declared SYNTHETIC selection, never the twelve-original collection.
        # Native dump, roles, complete inventory and existing recovery tools only.
        selection = root / 'selection'
        sources = {**{'database/' + name: work / 'state/final-backup' / name for name in (
            'final.PRIVATE.dump', 'roles.PRIVATE.sql', 'SNAPSHOT_CLOSURE.PRIVATE.json')},
            'prepare/runtime-files/node': node,
            'prepare/runtime-files/app/scripts/fixtures/w15-owned-process-stop.js': stop}
        rows = []
        for relative, source in sources.items():
            resources.sample()
            target = selection / relative
            target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            for parent in target.parents:
                if parent == selection:
                    break
                os.chmod(parent, 0o700)
            write(target, source.read_bytes())
            rows.append({'path': relative, **pin(target)})
        manifest = {'version': 1, **{k: context[k] for k in (
            'exactCommit', 'runId', 'runAttempt', 'inputManifestSHA', 'recipientFingerprint')},
            'files': sorted(rows, key=lambda row: row['path'])}
        manifest_raw = (json.dumps(manifest, sort_keys=True, separators=(',', ':')) + '\n').encode()
        manifest_sha = hashlib.sha256(manifest_raw).hexdigest()
        write(selection / 'manifest.PRIVATE.json', manifest_raw)
        collection = {'context': context, 'selectedPlaintextBytes': sum(row['bytes'] for row in rows),
                      'manifestSHA256': manifest_sha}
        phase = 'backup-seal'
        cipher = root / 'synthetic-only.gpg'
        sealed = backup.seal_restore_backup(collection, root=selection, output=cipher,
            public_key=public_key,
            guard=resources.sample)
        phase = 'backup-local-readback'
        cipher_pin = pin(cipher)
        need(cipher_pin == {'bytes': sealed['cipherBytes'], 'sha256': sealed['cipherSHA256']})
        result['sealVerified'] = True
        result['cipherBytes'] = cipher_pin['bytes']
        phase = 'backup-recovery'
        recovered = backup.restore_readback(selection, context=context,
            controller_context={'runtimePins': {'imageId': image, 'node': pin(node)}}, resources=resources,
            expected_manifest=manifest, expected_manifest_sha256=manifest_sha,
            rollback_root=root / 'rollback', guard=resources.sample)
        need(recovered['completeTableAndSequenceInventoryMatched'] is True and recovered['rolesSemanticsMatched'] is True)
        result['secondRestoreVerified'] = True
        phase = 'closure'
        resources.sample()
    except BaseException as error:
        failure = failure_details(work, phase, error)
        if phase == 'backup-recovery':
            failure = failure_details(root / 'rollback/work', phase, error)
    finally:
        if resources is not None:
            result['memory'] = resources.failure_observation()
        try:
            result['ownedContainersStopped'] = stop_containers(ctx, image)
            result['containerStop'] = 'PASS'
        except BaseException:
            failure = failure or failure_details(work, 'closure', RuntimeError())
        if watch is not None:
            try:
                watch.stop()
                need(not watch.thread.is_alive() and not watch.reporter.is_alive())
                result['watchStop'] = 'PASS'
            except BaseException:
                failure = failure or failure_details(work, 'closure', RuntimeError())
    if failure is not None:
        result['failure'] = failure
    else:
        result['status'] = 'PASS_REAL_SYNTHETIC_CONNECTION_ONLY'
    return result


def fork_worker(ctx, root, node, image, sender, receiver, docker_gid):
    receiver.close()
    start = load('runner_start')
    try:
        os.environ.clear()
        os.environ.update(start.ENV)
        os.setgroups([docker_gid])
        os.setgid(1000)
        os.setuid(1000)
        start._close_stdio()
        value = worker(ctx, root, node, image)
        if root.is_dir():
            write(root / 'RESULT.SAFE.json', start._encode(value, start.MAX_RESULT))
        if value['status'] == 'FAIL':
            packet = {'ok': False, 'phase': 'worker', 'workerPhase': value['failure']['phase'],
                      'runner': {'reason': 'WORKER_REPORTED_FAILURE'}}
            if value['memory'] is not None:
                packet['workerMemory'] = value['memory']
        else:
            packet = {'ok': True, 'result': value}
        sender.send_bytes(start._encode(packet, start.MAX_RESULT))
    finally:
        sender.close()


def supervise(ctx, root, node, image):
    start = load('runner_start')
    p = start.P
    identity = p.identity(p.R.KERNEL_ROOT / p.names(ctx)[0])
    last = {'memory': None}
    deadline = time.monotonic() + WALL - 35
    def guard():
        if time.monotonic() >= deadline:
            raise start.RunnerStartError('worker', runner={'reason': 'SUPERVISOR_DEADLINE'})
        return start._parent_readback(p, ctx, identity, last)
    fork = multiprocessing.get_context('fork')
    receiver, sender = fork.Pipe(duplex=False)
    child = fork.Process(target=fork_worker, args=(ctx, root, node, image, sender, receiver, p.socket_gid()))
    class NativeFixtureError(start.RunnerStartError):
        allowed_worker_phases = PHASES
    try:
        response, cleanup = start._monitor_child(child, receiver, sender, guard, deadline,
            memory=lambda: last['memory'], error_type=NativeFixtureError)
        return {**response['result'], 'ipcCleanup': cleanup}
    except start.RunnerStartError as error:
        result = {'status': 'FAIL', 'runnerFailure': error.safe_failure}
        # The error frame is consumed before the next guard by the unchanged
        # diagnostic fix. This bounded supplementary receipt preserves details
        # that intentionally are not part of the production IPC error schema.
        try:
            fd = os.open(root / 'RESULT.SAFE.json', os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
            try:
                snapshot = os.fstat(fd)
                need(stat.S_ISREG(snapshot.st_mode) and snapshot.st_uid == 1000
                     and snapshot.st_nlink == 1 and stat.S_IMODE(snapshot.st_mode) == 0o600
                     and 0 < snapshot.st_size <= start.MAX_RESULT)
                value = start._decode(os.read(fd, start.MAX_RESULT + 1))
                need(value['schema'] == 'helmut-w15-real-synthetic-connection/1'
                     and value['status'] == 'FAIL' and value['failure']['phase'] == error.worker_phase)
                # Read only the fixed fields used by this fixture's own producer.
                detail = value['failure']
                need(set(detail) == {'phase', 'category', 'nativeReturnCode', 'nativeSignal', 'sqlState'}
                     and detail['phase'] in PHASES and detail['category'] in (
                         'CHECK_REJECTED', 'FILESYSTEM_ACCESS_DENIED', 'FILESYSTEM_ENTRY_MISSING',
                         'COMMAND_TIMEOUT', 'POSTGRES_CONNECTION_REFUSED', 'POSTGRES_OBJECT_MISSING',
                         'POSTGRES_OBJECT_EXISTS', 'POSTGRES_STATEMENT_TIMEOUT', 'FILESYSTEM_NO_SPACE')
                     and detail['sqlState'] is None
                     and (detail['nativeReturnCode'] is None or type(detail['nativeReturnCode']) is int
                          and -255 <= detail['nativeReturnCode'] <= 255)
                     and detail['nativeSignal'] in (None, 'SIGTERM', 'SIGKILL', 'SIGINT', 'SIGSEGV', 'SIGABRT', 'SIGBUS'))
                result['failure'] = detail
                result['memory'] = start._closed_memory(value['memory'])
                for key in ('restoreSteps', 'exportActions', 'ownedContainersStopped'):
                    if type(value.get(key)) is int and 0 <= value[key] <= 9:
                        result[key] = value[key]
                for key in ('sealVerified', 'secondRestoreVerified'):
                    if type(value.get(key)) is bool:
                        result[key] = value[key]
            finally:
                os.close(fd)
        except BaseException:
            pass
        return result


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if not argv:
        print(json.dumps({'status': 'BLOCKED_EXPLICIT_NATIVE_MINIMAL_ARGUMENT_REQUIRED', 'testStarted': False}))
        return 0
    result, phase, created, identity = {'status': 'FAIL'}, 'binding', False, None
    service_attempted = False
    p, ctx, image = load('runner_parent'), None, None
    try:
        if len(argv) == 7 and argv[0] == '--internal-minimal':
            ctx = p.context(argv[1], argv[2], argv[3])
            result = supervise(ctx, Path(argv[4]), Path(argv[5]), argv[6])
            print(json.dumps(result, sort_keys=True))
            return 0 if result['status'] == 'PASS_REAL_SYNTHETIC_CONNECTION_ONLY' else 1
        need(len(argv) == 2 and argv[0] == '--native-minimal' and os.getuid() == 0)
        need(os.environ.get('GITHUB_ACTIONS') == 'true' and os.environ.get('GITHUB_RUN_ATTEMPT') == '1')
        ctx = p.context(os.environ['GITHUB_RUN_ID'], os.environ['GITHUB_SHA'], str(uuid.uuid4()))
        p.github_binding(ctx['runId'], ctx['exactCommit'])
        need(p.command(['/usr/bin/git', '-c', 'safe.directory=' + str(REPO), '-C', str(REPO),
                        'show', ctx['exactCommit'] + ':' + str(SCRIPT.relative_to(REPO))]).stdout == SCRIPT.read_bytes())
        node = Path(argv[1]).resolve(strict=True)
        need(pin(node)['sha256'] == NODE_SHA)
        image = call(p.DOCKER + ['image', 'inspect', '--format', '{{.Id}}', IMAGE]).decode().strip()
        need(re.fullmatch('sha256:[a-f0-9]{64}', image))
        root = Path('/tmp/w15-native-minimal-' + uuid.UUID(ctx['nonce']).hex)
        need(not root.exists())
        phase = 'parent'
        p.prepare_parent(ctx)
        created = True
        identity = p.identity(p.R.KERNEL_ROOT / p.names(ctx)[0])
        initial = p.read_parent(ctx, identity, empty=True)
        phase = 'service'
        unit, service, _ = p.names(ctx)
        existing = call(['/usr/bin/systemctl', 'show', service, '--property=LoadState', '--value']).decode().strip()
        need(existing == 'not-found')
        service_attempted = True
        response = subprocess.run(['/usr/bin/systemd-run', '--quiet', '--wait', '--pipe', '--collect',
            '--service-type=exec', '--unit=' + service, '--slice=' + unit,
            '--property=User=0', '--property=Group=0', '--property=RuntimeMaxSec=' + str(WALL - 15),
            '--property=TimeoutStopSec=10', '--property=KillMode=control-group',
            '/usr/bin/env', '-i', *[k + '=' + v for k, v in p.process_env(ctx).items()],
            '/usr/bin/python3', '-I', '-B', str(SCRIPT), '--internal-minimal', ctx['runId'],
            ctx['exactCommit'], ctx['nonce'], str(root), str(node), image],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=WALL, close_fds=True)
        need(len(response.stdout) <= 65536)
        result = json.loads(response.stdout)
        need(type(result) is dict and result.get('status') in ('PASS_REAL_SYNTHETIC_CONNECTION_ONLY', 'FAIL'))
        need(response.returncode == (0 if result['status'].startswith('PASS_') else 1))
        phase = 'closure'
        result['initialCommonParent'] = initial
        result['finalCommonParent'] = p.read_parent(ctx, identity, empty=True)
        result['parentEmpty'] = 'PASS' if p.parent_empty(ctx, identity) else 'FAIL'
    except BaseException as error:
        if 'failure' not in result and 'runnerFailure' not in result:
            result['failure'] = failure_details(None, phase, error)
        if isinstance(error, p.ProbeError):
            result['parentFailure'] = p.failure_record(error)
            result['memory'] = p.R.closed_failure_memory(error.failure_memory)
        result['status'] = 'FAIL'
    finally:
        if created:
            try:
                if service_attempted:
                    stop_service(ctx)
                    result['serviceStop'] = 'PASS'
                # Service exit alone does not prove daemon-created containers stopped.
                result['ownedContainersStopped'] = stop_containers(ctx, image)
                result['containerStop'] = 'PASS'
                result['parentEmpty'] = 'PASS' if p.parent_empty(ctx, identity) else 'FAIL'
                need(result['parentEmpty'] == 'PASS')
                result['postStopCommonParent'] = p.read_parent(ctx, identity, empty=True)
                p.remove_parent(ctx)
                result['parentRemoved'] = 'PASS'
            except BaseException:
                result['parentRemoved'] = 'UNKNOWN'
                result['status'] = 'FAIL'
        if ctx is not None:
            result.update(exactCommit=ctx['exactCommit'], runId=ctx['runId'], runAttempt=1)
        result['retryAllowed'] = False
    print(json.dumps(result, sort_keys=True))
    return 0 if result['status'] == 'PASS_REAL_SYNTHETIC_CONNECTION_ONLY' else 1


if __name__ == '__main__':
    sys.exit(main())
