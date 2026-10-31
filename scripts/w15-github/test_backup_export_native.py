"""Gated native export bridge in the existing synthetic CI PostgreSQL service.

The exact existing NODE_WORKER produces the four real native outputs, receipts,
identities and lifecycle journals. The existing export verifier checks them.
Original-restore closure, run/container naming and RAM observation are explicit
fixture substitutions; this test cannot accept Restore, RAM or an owned runner.
"""
import sys
sys.dont_write_bytecode = True

import importlib.util
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import tarfile
import tempfile
import time
from unittest.mock import patch
import uuid

HERE = Path(__file__).absolute().parent
SERVICE = {'PGHOST': '127.0.0.1', 'PGPORT': '5433', 'PGUSER': 'helmut', 'PGPASSWORD': 'helmut'}
PHASES = {'service-binding', 'service-inspect', 'service-version', 'role-binding',
          'role-create', 'fixture-create', 'fixture-setup', 'worker-setup',
          'export-verification', 'cleanup'}
PHASES |= {action + suffix for action in ('backup-before', 'backup-dump', 'backup-roles', 'backup-after')
           for suffix in ('-native', '-copy', '-verify')}
MAX_BYTES = 4 * 1024 * 1024


class FixtureRejected(RuntimeError):
    pass


def need(value):
    if not value:
        raise FixtureRejected('SYNTHETIC_NATIVE_EXPORT_FIXTURE_REJECTED')


def load(name):
    spec = importlib.util.spec_from_file_location('w15_native_export_fixture_' + name, HERE / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def run_fixture():
    phase, failure, actions, checks = 'service-binding', None, [], 0
    export_verified = False
    started = time.monotonic()
    work_deadline, cleanup_deadline = started + 140, started + 175
    token = uuid.uuid4().hex
    database = 'w15_export_fixture_' + token
    container_root = '/tmp/w15-export-fixture-' + token
    role_marker = 'W15_SYNTHETIC_EXPORT_' + token
    database_attempted = role_attempted = worker_attempted = False
    database_dropped = role_clean = worker_clean = False
    role_created = False
    native_returncode = None
    temporary = None
    command = None
    docker = None
    container = None
    try:
        need(os.environ.get('GITHUB_ACTIONS') == 'true'
             and all(os.environ.get(k) == v for k, v in SERVICE.items()))
        container = os.environ.get('W15_BACKUP_EXPORT_FIXTURE_CONTAINER')
        need(type(container) is str and re.fullmatch('[a-f0-9]{64}', container))
        docker, node = shutil.which('docker'), shutil.which('node')
        need(docker is not None and node is not None)
        prefix = [docker, '--host=unix:///var/run/docker.sock']

        def call(argv, *, raw=None, maximum=MAX_BYTES, cleanup=False):
            deadline = cleanup_deadline if cleanup else work_deadline
            remaining = int(deadline - time.monotonic())
            need(remaining > 0)
            result = subprocess.run(argv, input=raw, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                timeout=min(25, remaining), close_fds=True, check=False)
            need(result.returncode == 0 and len(result.stdout) <= maximum and len(result.stderr) <= MAX_BYTES)
            return result

        phase = 'service-inspect'
        info = json.loads(call(prefix + ['inspect', container]).stdout)
        need(len(info) == 1 and info[0]['Id'] == container and info[0]['State']['Running'] is True
             and info[0]['Config']['Image'].startswith('postgres:17'))
        ports = info[0]['NetworkSettings']['Ports'].get('5432/tcp')
        need(type(ports) is list and any(p.get('HostPort') == SERVICE['PGPORT'] for p in ports))

        def command(target, sql, *, cleanup=False):
            argv = prefix + ['exec', '-i', container, '/usr/lib/postgresql/17/bin/psql',
                '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '--no-password',
                '--host=/var/run/postgresql', '--username=helmut', '--dbname=' + target, '-f', '-']
            return call(argv, raw=sql.encode('utf-8'), cleanup=cleanup).stdout.decode('utf-8').strip()

        phase = 'service-version'
        version = command('postgres', 'show server_version_num;')
        need(re.fullmatch('[0-9]+', version) and 170000 <= int(version) < 180000)
        checks += 1
        phase = 'role-binding'
        exists = command('postgres', "select exists(select 1 from pg_roles where rolname='postgres');")
        need(exists in ('t', 'f'))
        if exists == 'f':
            phase = 'role-create'
            role_attempted = True
            command('postgres', "begin; create role postgres login superuser; comment on role postgres is '"
                    + role_marker + "'; commit;")
            role_created = True
        need(command('postgres', "select rolcanlogin and rolsuper from pg_roles where rolname='postgres';") == 't')
        checks += 1
        phase = 'fixture-create'
        need(command('postgres', "select exists(select 1 from pg_database where datname='" + database + "');") == 'f')
        database_attempted = True
        command('postgres', 'create database "' + database + '" template template0 encoding \'UTF8\';')
        phase = 'fixture-setup'
        source = load('test_backup_snapshot_postgres')
        command(database, source.SETUP)
        need(command(database, 'select count(*)::text||\':\'||(count(*)filter(where aktiv))::text '
                     'from public.mandate_profiles;') == '500:0')
        checks += 1

        phase = 'worker-setup'
        worker_attempted = True
        call(prefix + ['exec', container, 'mkdir', '-p', container_root + '/state/final-backup'])
        call(prefix + ['cp', str(Path(node).resolve()), container + ':' + container_root + '/node'])
        call(prefix + ['exec', container, 'chown', '-R', '1000:1000', container_root])
        call(prefix + ['exec', container, 'chmod', '700', container_root, container_root + '/state',
                       container_root + '/state/final-backup'])
        call(prefix + ['exec', container, 'chmod', '755', container_root + '/node'])
        temporary = tempfile.TemporaryDirectory(prefix='w15-native-export-fixture-')
        work = Path(temporary.name)
        (work / 'state').mkdir(mode=0o700)
        export = load('restore_backup')
        context = {'schema': 'helmut-w15-backup-context/1', 'scope': 'ISOLATED_GITHUB_END500_BACKUP_ONLY',
            'nonce': str(uuid.UUID(hex=token)), 'exactCommit': '60195031c9187cf91ce4497f8875977683914f20',
            'runId': '940000000001', 'runAttempt': 1,
            'inputManifestSHA': hashlib.sha256(b'W15_SYNTHETIC_NATIVE_EXPORT_BRIDGE_ONLY').hexdigest(),
            'recipientFingerprint': export.FINGERPRINT, 'executionAuthority': False}

        def copy_outputs(action):
            raw = call(prefix + ['cp', container + ':' + container_root + '/state/.', '-']).stdout
            expected = {action + '.node.SAFE.json': work / 'state' / (action + '.node.SAFE.json')}
            for name in (export.OUTPUTS[action], action + '.PRIVATE.stderr',
                         action + '.lifecycle.PRIVATE.jsonl', action + '.SAFE.json'):
                expected['final-backup/' + name] = work / 'state/final-backup' / name
            copied = set()
            with tarfile.open(fileobj=io.BytesIO(raw), mode='r:*') as archive:
                members = archive.getmembers()
                need(len(members) <= 100)
                for member in members:
                    name = PurePosixPath(member.name)
                    need(not name.is_absolute() and '..' not in name.parts and (member.isdir() or member.isfile()))
                    normalized = str(name)
                    if normalized.startswith('state/'):
                        normalized = normalized[len('state/'):]
                    if normalized not in expected:
                        continue
                    need(member.isfile() and normalized not in copied and 0 <= member.size <= MAX_BYTES)
                    stream = archive.extractfile(member)
                    need(stream is not None)
                    data = stream.read(MAX_BYTES + 1)
                    need(len(data) == member.size)
                    fd = os.open(expected[normalized], os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
                    with os.fdopen(fd, 'wb') as output:
                        output.write(data)
                    copied.add(normalized)
            need(copied == set(expected))

        def run_owned(argv, action, seconds):
            nonlocal phase, native_returncode
            need(action in export.ACTIONS and action not in actions and seconds <= 600)
            need(argv[:8] == list(export.DOCKER) + ['exec', '--user', '1000:1000', container, 'sh', '-c'])
            phase = action + '-native'
            # The production-generated command contains the unchanged actual worker.
            remaining = int(work_deadline - time.monotonic())
            need(remaining > 0)
            native_returncode = None
            process = subprocess.run(argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                timeout=min(25, remaining), close_fds=True, check=False)
            native_returncode = process.returncode
            need(process.returncode == 0 and len(process.stdout) <= MAX_BYTES and len(process.stderr) <= MAX_BYTES)
            phase = action + '-copy'
            copy_outputs(action)
            actions.append(action)
            phase = action + '-verify'
            return subprocess.CompletedProcess(argv, process.returncode)

        # These already qualified original-run prerequisites are not re-enacted.
        # No resource, original restore, namespace-owner or stop acceptance is claimed.
        with patch.object(export, '_restore_closure', return_value=None), \
             patch.object(export, '_sample', return_value={'syntheticObservationOnly': True}), \
             patch.object(export.B, 'database_export_plan', return_value=None), \
             patch.object(export.B, 'BASE', container_root):
            result = export.export_restore_database(context, expected_context=context, work=work,
                container=container, database=database, supervisor=None, run_owned=run_owned, seconds=60)
        phase = 'export-verification'
        need(actions == list(export.ACTIONS) and set(result['pins']) == set(export.ACTIONS)
             and result['beforeSnapshot'] == result['afterSnapshot']
             and result['beforeSnapshot']['profiles'] == 500 and result['beforeSnapshot']['activeProfiles'] == 0
             and result['acceptedAsCompleteBackup'] is False and result['databaseRestoreObserved'] is False)
        checks += 1
        export_verified = True
    except (Exception, KeyboardInterrupt):
        failure = phase if phase in PHASES else 'service-binding'
    finally:
        try:
            if database_attempted:
                command('postgres', 'drop database if exists "' + database + '";', cleanup=True)
                need(command('postgres', "select exists(select 1 from pg_database where datname='" + database + "');", cleanup=True) == 'f')
            database_dropped = True
            if role_attempted:
                marker = command('postgres', "select shobj_description(oid,'pg_authid') from pg_roles where rolname='postgres';", cleanup=True)
                if marker == role_marker:
                    command('postgres', 'drop role postgres;', cleanup=True)
                    need(command('postgres', "select exists(select 1 from pg_roles where rolname='postgres');", cleanup=True) == 'f')
                else:
                    need(not role_created)
            role_clean = True
        except (Exception, KeyboardInterrupt):
            failure = failure or 'cleanup'
        try:
            if worker_attempted:
                call(prefix + ['exec', container, 'rm', '-rf', '--', container_root], cleanup=True)
                call(prefix + ['exec', container, 'test', '!', '-e', container_root], cleanup=True)
            worker_clean = True
            if temporary is not None:
                temporary.cleanup()
        except (Exception, KeyboardInterrupt):
            failure = failure or 'cleanup'
    safe = {'status': 'PASS_NATIVE_EXPORT_BRIDGE_ONLY' if failure is None else 'FAIL_NATIVE_EXPORT_BRIDGE_ONLY',
        'checksPassed': checks, 'nativeActionsCompleted': len(actions),
        'nativeActionsVerified': len(actions) if export_verified else 0, 'fixtureDatabaseDropped': database_dropped,
        'createdSyntheticPostgresRole': role_created, 'ownedSyntheticRoleCleaned': role_clean,
        'workerFilesCleaned': worker_clean, 'originalDataRead': False, 'originalRestoreObserved': False,
        'ownedRunnerAccepted': False, 'fullLifetimeMemoryAccepted': False, 'backupRoundtripAccepted': False,
        'executionAuthority': False, 'end500Acceptance': False, 'mock500Acceptance': False}
    if failure is not None:
        safe['phase'] = failure
        if type(native_returncode) is int:
            safe['nativeWorkerReturnCode'] = native_returncode
    return safe, 0 if failure is None else 1


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if argv in ([], ['--plan']):
        value, code = {'status': 'BLOCKED_EXPLICIT_POSTGRES_FIXTURE_ARGUMENT_REQUIRED',
            'executionAuthority': False, 'testStarted': False}, 0
    elif argv == ['--postgres-fixture']:
        value, code = run_fixture()
    else:
        value, code = {'status': 'FAIL_NATIVE_EXPORT_FIXTURE_ARGUMENTS',
            'executionAuthority': False, 'testStarted': False}, 2
    print(json.dumps(value, sort_keys=True))
    return code


if __name__ == '__main__':
    sys.exit(main())
