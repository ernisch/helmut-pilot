"""Read one independently pinned existing error capsule, never run Materials.

The workflow owns the pinned download action. This helper has no HTTP, upload,
database, unit or model interface. Private evidence remains on the private runner.
"""
import sys
sys.dont_write_bytecode = True

import argparse
from datetime import datetime, timezone
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import resource
import select
import stat
import subprocess
import tarfile
import uuid

HERE = Path(__file__).absolute().parent
REPO = HERE.parents[1]
MODE = 'mock500-materials-capsule-readback'
SCOPE = 'READ_EXISTING_MATERIALS_CAPSULE_ONLY'
SOURCE_RUN, SOURCE_ARTIFACT = 41455150159, 13145634042
SOURCE_COMMIT = '582ca4e6dca9d78b0008d8837ed1b171cf8fe920'
CIPHER = {'bytes': 10699, 'sha256': 'fa9ff9bae552cf3998101470dc88c3e6c3347800113e0960afbe34609a5e5753'}
SOURCE_INPUT_SHA = 'af3bd654fa292ad256e0fa265c2fb3d968e945633f1439a12da72f015aeab86f'
ROOT_NAME, CIPHER_NAME = 'w15-materials-capsule-readback', 'mock500-materials-diagnostic.PRIVATE.gpg'
OUTCOME, COLLECTION = 'MATERIALS_DIAGNOSTIC_OUTCOME.PRIVATE.json', 'MATERIALS_COLLECTION.PRIVATE.json'
SOURCES = ('MATERIALS_FIRST_FAILURE.SAFE.json', 'MATERIALS_CONTROLLER_FIRST_FAILURE.PRIVATE.json', 'materials.PRIVATE.log')
MAX_FILE, MAX_PAYLOAD, MAX_PLAINTEXT = 65536, 262144, 1048576
PHASES = frozenset(('arguments', 'admission', 'cipher', 'recipient', 'decrypt', 'archive', 'outcome', 'agent-close'))


def load(name):
    spec = importlib.util.spec_from_file_location('materials_capsule_' + name, HERE / (name + '.py'))
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


V, S, CONTRACT = map(load, ('verify_receiver_key', 'seal', 'mock500_materials_contract'))
A, P = V.A, V.P


class CapsuleError(ValueError):
    def __init__(self, phase, projection=None):
        self.phase = phase if phase in PHASES else 'arguments'
        self.projection = projection
        super().__init__('EXISTING_MATERIALS_CAPSULE_REJECTED')


def need(value, phase='admission'):
    if not value: raise CapsuleError(phase)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True, allow_nan=False).encode()


def decode(raw, phase='admission'):
    def unique(rows):
        result = {}
        for key, value in rows:
            need(key not in result, phase); result[key] = value
        return result
    try:
        return json.loads(raw, object_pairs_hook=unique,
            parse_constant=lambda _: (_ for _ in ()).throw(CapsuleError(phase)))
    except CapsuleError:
        raise
    except (ValueError, TypeError, UnicodeError):
        raise CapsuleError(phase) from None


def validate_request(value, expected_commit, *, now=None):
    keys = {'schema', 'scope', 'authorized', 'exactCommit', 'nonce', 'sourceRun', 'sourceCommit',
            'sourceArtifact', 'cipherPin', 'issuedAt', 'expiresAt'}
    need(type(value) is dict and set(value) == keys
         and value['schema'] == 'helmut-w15-materials-capsule-readback-request/1'
         and value['scope'] == SCOPE and value['authorized'] is True
         and type(expected_commit) is str and re.fullmatch('[a-f0-9]{40}', expected_commit)
         and value['exactCommit'] == expected_commit and value['sourceCommit'] == SOURCE_COMMIT
         and type(value['sourceRun']) is int and value['sourceRun'] == SOURCE_RUN
         and type(value['sourceArtifact']) is int and value['sourceArtifact'] == SOURCE_ARTIFACT
         and type(value['cipherPin']) is dict and value['cipherPin'] == CIPHER)
    nonce = uuid.UUID(value['nonce'])
    need(str(nonce) == value['nonce'] and nonce.version == 4 and nonce.variant == uuid.RFC_4122)
    def utc(text):
        need(type(text) is str and re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?Z', text))
        return datetime.fromisoformat(text.replace('Z', '+00:00'))
    issued, expires = utc(value['issuedAt']), utc(value['expiresAt'])
    now = datetime.now(timezone.utc) if now is None else now
    need(issued <= now < expires and 0 < (expires - issued).total_seconds() <= 900)
    return value


def bind_runtime(request, expected_commit):
    need(os.environ.get('GITHUB_EVENT_NAME') == 'workflow_dispatch'
         and os.environ.get('GITHUB_WORKFLOW_SHA') == expected_commit
         and os.environ.get('EXPECTED_COMMIT') == expected_commit)
    event_raw = Path(os.environ['GITHUB_EVENT_PATH']).read_bytes()
    need(0 < len(event_raw) <= 1048576)
    inputs = decode(event_raw).get('inputs')
    need(type(inputs) is dict and {'w15_mode', 'expected_commit', 'w15_request'} <= set(inputs)
         <= {'w15_mode', 'expected_commit', 'w15_request', 'w15_cipher_index'}
         and inputs['w15_mode'] == MODE and inputs['expected_commit'] == expected_commit
         and inputs.get('w15_cipher_index', '') == ''
         and type(inputs['w15_request']) is str and decode(inputs['w15_request']) == request)
    identity = V.bind_runtime(expected_commit)
    for relative in ('scripts/w15-github/mock500_materials_capsule_readback.py',
                     'scripts/w15-github/mock500_materials_contract.py', 'scripts/w15-github/seal.py',
                     'scripts/w15-github/encrypted_index.py', 'scripts/w15-github/runner_diagnostics.py',
                     'scripts/w15-github/artifact_transport.py', '.github/workflows/ci.yml'):
        source = REPO / relative
        result = subprocess.run(['/usr/bin/git', '--no-optional-locks', '-c', 'core.hooksPath=/dev/null',
            '-c', 'safe.directory=' + str(REPO), '-C', str(REPO), 'ls-tree', '-z', expected_commit, '--', relative],
            stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, env=V.ENV, timeout=15)
        need(result.returncode == 0 and len(result.stdout) <= 8192 and not source.is_symlink())
        header, name = result.stdout.rstrip(b'\0').split(b'\t'); mode, kind, digest = header.split()
        raw = source.read_bytes()
        need(mode in (b'100644', b'100755') and kind == b'blob' and name.decode() == relative
             and hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest().encode() == digest)
    return identity


def write(root, name, value):
    try:
        with os.fdopen(A._file(root, name), 'wb') as out:
            out.write(canonical(value) + b'\n'); out.flush(); os.fsync(out.fileno())
    except OSError: raise CapsuleError('admission') from None


def admit(request, expected_commit, runner_temp, *, now=None):
    validate_request(request, expected_commit, now=now)
    identity = bind_runtime(request, expected_commit)
    parent = S._directory(runner_temp)
    try:
        meta = os.fstat(parent)
        need(meta.st_uid == os.getuid() and stat.S_IMODE(meta.st_mode) & 0o022 == 0)
        os.mkdir(ROOT_NAME, 0o700, dir_fd=parent); os.fsync(parent)
    finally: os.close(parent)
    root = Path(runner_temp) / ROOT_NAME
    (root / 'cipher').mkdir(mode=0o700)
    write(root, 'ADMITTED.SAFE.json', {'requestSHA256': hashlib.sha256(canonical(request)).hexdigest(),
        'nonce': request['nonce'], **identity})
    return {'status': 'ADMITTED_EXISTING_CAPSULE_DOWNLOAD_ONLY', 'scope': SCOPE,
            'exactCommit': expected_commit, 'nonce': request['nonce'], 'executionAuthority': False}


def read_cipher(root):
    directory = S._directory(str(root / 'cipher'), private=True)
    try:
        need(os.listdir(directory) == [CIPHER_NAME], 'cipher')
        fd = os.open(CIPHER_NAME, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory)
        try:
            before = os.fstat(fd)
            need(stat.S_ISREG(before.st_mode) and before.st_uid == os.getuid() and before.st_nlink == 1
                 and stat.S_IMODE(before.st_mode) in (0o600, 0o644) and before.st_size == CIPHER['bytes'], 'cipher')
            os.fchmod(fd, 0o600)
            snapshot = S._snapshot(os.fstat(fd)); raw = os.read(fd, CIPHER['bytes'] + 1)
            need(len(raw) == CIPHER['bytes'] and hashlib.sha256(raw).hexdigest() == CIPHER['sha256']
                 and S._snapshot(os.fstat(fd)) == snapshot, 'cipher')
            return raw
        finally: os.close(fd)
    finally: os.close(directory)


def decrypt(cipher, root, home, key, secret):
    A._run(root, home, 'key-import', ['--disable-dirmngr', '--import'], data=key, secret=secret)
    for kind, flag in (('sec', '--list-secret-keys'), ('pub', '--list-keys')):
        V.primary(A._run(root, home, kind + '-primary',
            ['--disable-dirmngr', '--with-colons', '--fingerprint', flag]), kind)
    fd = A._file(root, 'capsule-decrypted.PRIVATE.tar')
    previous = resource.getrlimit(resource.RLIMIT_FSIZE)
    bounded = MAX_PLAINTEXT if previous[0] == resource.RLIM_INFINITY else min(MAX_PLAINTEXT, previous[0])
    try:
        resource.setrlimit(resource.RLIMIT_FSIZE, (bounded, previous[1]))
        A._run(root, home, 'capsule-decrypt', ['--disable-dirmngr', '--status-fd', '2', '--decrypt'],
               data=cipher, output=fd, secret=secret)
        os.fsync(fd); need(0 < os.fstat(fd).st_size <= MAX_PLAINTEXT, 'decrypt')
    finally:
        os.close(fd); resource.setrlimit(resource.RLIMIT_FSIZE, previous)
    parent = P.open_root(str(root))
    try:
        status = P.inspect_file(parent, 'capsule-decrypt.PRIVATE.log', retain_limit=65536)
        rows = set(status.splitlines())
        need(b'[GNUPG:] DECRYPTION_OKAY' in rows and b'[GNUPG:] GOODMDC' in rows
             and not any(row.startswith((b'[GNUPG:] BADMDC', b'[GNUPG:] DECRYPTION_FAILED')) for row in rows), 'decrypt')
        return P.inspect_file(parent, 'capsule-decrypted.PRIVATE.tar', retain_limit=MAX_PLAINTEXT)
    finally: os.close(parent)


def stop_agent(home):
    # SO_PEERCRED can identify a pre-fork socket creator. The existing official
    # client already resolved this home's serving agent successfully in CI.
    # Never autostart; bind the actual PID before scoped kill and require exit.
    pidfd = None
    try:
        try:
            observed = subprocess.run(['/usr/bin/gpg-connect-agent', '--homedir', str(home),
                '--no-autostart', 'GETINFO pid', '/bye'], stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, env=V.ENV,
                timeout=5, close_fds=True)
            raw = observed.stdout
            need(observed.returncode == 0 and type(raw) is bytes and 0 < len(raw) <= 64,
                 'agent-close')
            result = re.fullmatch(rb'D ([1-9][0-9]{0,9})\nOK\n', raw)
            need(result is not None, 'agent-close')
            pid = int(result[1]); need(1 < pid < 2**31, 'agent-close')
            pidfd = os.pidfd_open(pid)
            owner = os.stat('/proc/' + str(pid), follow_symlinks=False)
            need(stat.S_ISDIR(owner.st_mode) and owner.st_uid == os.getuid(), 'agent-close')
        except (OSError, subprocess.SubprocessError, CapsuleError):
            # Request only this home's existing close, but never claim an
            # observed stop without a positively identified agent and pidfd.
            load('encrypted_index')._close_agent(home)
            raise CapsuleError('agent-close') from None
        load('encrypted_index')._close_agent(home)
        poll = select.poll(); poll.register(pidfd, select.POLLIN)
        need(any(fd == pidfd and events & select.POLLIN for fd, events in poll.poll(5000)), 'agent-close')
    finally:
        if pidfd is not None: os.close(pidfd)


def controller_projection(raw):
    if type(raw) is not dict: return None
    phases = load('runner_diagnostics').MOCK_CONTROLLER_PHASES
    kind = {'AssertionError': 'assertion', 'PermissionError': 'filesystem', 'FileNotFoundError': 'filesystem',
        'OSError': 'filesystem', 'RuntimeError': 'runtime', 'TypeError': 'type', 'ValueError': 'value',
        'KeyError': 'key', 'TimeoutExpired': 'timeout'}.get(raw.get('type'), 'unknown')
    trace = raw.get('traceback', '')
    trace = trace.split('\n' + str(raw.get('type')) + ':', 1)[0] if type(trace) is str else ''
    frames = re.findall(r'^\s*File "[^"\r\n]*scripts/synthetik-500-w15-full500-controller\.py", line ([0-9]{1,4}), in [A-Za-z_][A-Za-z0-9_]*\s*$', trace, re.MULTILINE)
    line = int(frames[-1]) if frames else 0
    return {'phase': raw.get('phase') if raw.get('phase') in phases else 'UNKNOWN', 'kind': kind,
            'location': 'CONTROLLER_PUBLIC_LINE_' + str(line).zfill(3) if 1 <= line <= 1024 else 'UNKNOWN'}


def parse_capsule(plaintext, private_root):
    need(type(plaintext) is bytes and 0 < len(plaintext) <= MAX_PLAINTEXT, 'archive')
    contents, offset, total = {}, 0, 0
    def member(archive, expected):
        nonlocal offset, total
        row = archive.next()
        need(row is not None and row.name == expected and row.type in (tarfile.REGTYPE, tarfile.AREGTYPE)
             and row.offset == offset and row.offset_data == offset + 512 and row.sparse is None
             and not row.linkname and not row.pax_headers and 0 <= row.size <= MAX_FILE
             and plaintext[offset + 257:offset + 265] == b'ustar\x0000', 'archive')
        raw = archive.extractfile(row).read(MAX_FILE + 1)
        need(len(raw) == row.size, 'archive')
        offset = row.offset_data + ((row.size + 511) // 512) * 512
        total += row.size; need(total <= MAX_PAYLOAD, 'archive')
        return raw
    with tarfile.open(fileobj=io.BytesIO(plaintext), mode='r:') as archive:
        raw = member(archive, 'W15_MANIFEST.PRIVATE.json'); manifest = decode(raw, 'archive')
        keys = {'version', 'exactCommit', 'runId', 'runAttempt', 'inputManifestSHA', 'recipientFingerprint', 'files'}
        need(type(manifest) is dict and set(manifest) == keys and manifest['version'] == 1
             and type(manifest['version']) is int and manifest['exactCommit'] == SOURCE_COMMIT
             and manifest['runId'] == str(SOURCE_RUN) and manifest['runAttempt'] == 1
             and type(manifest['runAttempt']) is int and manifest['inputManifestSHA'] == SOURCE_INPUT_SHA
             and manifest['recipientFingerprint'] == V.FINGERPRINT, 'archive')
        entries = manifest['files']
        need(type(entries) is list and 2 <= len(entries) <= 5, 'archive')
        for entry in entries:
            need(type(entry) is dict and set(entry) == {'path', 'bytes', 'sha256'}
                 and entry['path'] in (*SOURCES, OUTCOME, COLLECTION) and entry['path'] not in contents
                 and type(entry['bytes']) is int and 0 <= entry['bytes'] <= MAX_FILE
                 and type(entry['sha256']) is str and re.fullmatch('[a-f0-9]{64}', entry['sha256']), 'archive')
            data = member(archive, 'files/' + entry['path'])
            need(len(data) == entry['bytes'] and hashlib.sha256(data).hexdigest() == entry['sha256'], 'archive')
            contents[entry['path']] = data
        need(archive.next() is None and len(plaintext) - offset >= 1024
             and len(plaintext) % 512 == 0 and not any(plaintext[offset:])
             and OUTCOME in contents and COLLECTION in contents, 'archive')
    metadata = decode(contents[COLLECTION], 'archive')
    need(type(metadata) is dict and set(metadata) == {'scope', 'sources', 'privateSelectionOnly', 'completeBackup'}
         and metadata.get('scope') == 'ISOLATED_GITHUB_MOCK500_MATERIALS_DIAGNOSTIC_ONLY'
         and metadata.get('privateSelectionOnly') is True and metadata.get('completeBackup') is False
         and type(metadata.get('sources')) is list and len(metadata['sources']) == len(SOURCES), 'archive')
    states = {}
    for record in metadata['sources']:
        need(type(record) is dict and record.get('path') in SOURCES and record['path'] not in states
             and type(record.get('present')) is bool and record['present'] is (record['path'] in contents), 'archive')
        if record['present']:
            need(type(record.get('originalBytes')) is int and record['originalBytes'] >= 0
                 and record.get('retainedBytes') == len(contents[record['path']])
                 and record.get('truncated') is (record['originalBytes'] > MAX_FILE)
                 and record.get('strategy') == ('COMPLETE' if not record['truncated'] else 'FIRST_AND_LAST_32768_BYTES_NOT_COMPLETE')
                 and record['retainedBytes'] == min(record['originalBytes'], MAX_FILE), 'archive')
        states[record['path']] = record
    outcome = decode(contents[OUTCOME], 'outcome'); need(type(outcome) is dict and type(outcome.get('materialsCompleted')) is bool, 'outcome')
    def complete_json(name):
        record = states[name]
        if not record['present'] or record.get('truncated') or not contents[name]: return None
        try: return decode(contents[name], 'outcome')
        except (ValueError, UnicodeError): return None
    node = complete_json(SOURCES[0]); node_safe = node.get('safe') if type(node) is dict else None
    node_safe = CONTRACT.failure(node_safe) if node_safe is not None else None
    first = outcome.get('firstFailure')
    first = CONTRACT.failure(first) if first is not None else node_safe
    need(first is None or node_safe is None or first == node_safe, 'outcome')
    zero = outcome.get('cleanup'); zero = zero if type(zero) is dict else {}
    zero_states = ('NO_OWNED_NATIVE_CONTEXT', 'NO_OWNED_NATIVE_SLOT', 'BOUND_PREPARED_ZERO', 'BOUND_ENDED_ZERO')
    observed_zero = (zero.get('confirmedZero') is True and zero.get('profileFieldsUnchanged') is True
                     and zero.get('profiles') == 500 and type(zero.get('activeProfiles')) is int
                     and zero['activeProfiles'] == 0 and zero.get('nativeZeroState') in zero_states)
    destination = private_root / 'private-evidence'; destination.mkdir(mode=0o700)
    for name, data in contents.items():
        with os.fdopen(A._file(destination, name), 'wb') as out: out.write(data)
    return {'materialsCompleted': outcome['materialsCompleted'], 'firstFailure': first,
        'nodeFirstFailure': node_safe, 'controllerFailure': controller_projection(complete_json(SOURCES[1])),
        'sourceReportedActiveProfiles': 0 if observed_zero else 'UNKNOWN',
        'sourceNativeZeroState': zero['nativeZeroState'] if observed_zero else 'UNKNOWN',
        'sourceProfileFieldsUnchanged': True if observed_zero else 'UNKNOWN',
        'sourceZeroEvidenceScope': 'CAPSULE_REPORTED_ONLY_NO_NEW_DATABASE_OBSERVATION',
        'sourceProcessClosure': 'UNKNOWN', 'collectionTruncated': any(record.get('truncated') is True for record in states.values())}


def read_existing(request, expected_commit, runner_temp, *, now=None):
    validate_request(request, expected_commit, now=now); identity = bind_runtime(request, expected_commit)
    root = Path(runner_temp) / ROOT_NAME; parent = P.open_root(str(root))
    try:
        admitted = decode(P.inspect_file(parent, 'ADMITTED.SAFE.json', retain_limit=8192))
        need(admitted == {'requestSHA256': hashlib.sha256(canonical(request)).hexdigest(), 'nonce': request['nonce'], **identity})
    finally: os.close(parent)
    write(root, 'READ_ATTEMPT.SAFE.json', {'nonce': request['nonce'], 'retryAllowed': False})
    phase, home, projection, failure = 'cipher', None, None, None
    try:
        cipher = read_cipher(root)
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
        phase = 'recipient'; key, secret = V.read_environment()
        crypto_root = V.private_root(str(root)); home = crypto_root / 'gnupg'; home.mkdir(mode=0o700)
        need(len(os.fsencode(home / 'S.gpg-agent.browser')) <= 79, 'recipient')
        phase = 'decrypt'; plaintext = decrypt(cipher, crypto_root, home, key, secret)
        phase = 'archive'; projection = parse_capsule(plaintext, crypto_root)
    except BaseException as error:
        failure = error if isinstance(error, CapsuleError) else CapsuleError(phase)
    finally:
        if home is not None:
            try: stop_agent(home)
            except BaseException: failure = failure or CapsuleError('agent-close')
    if failure is not None:
        failure.projection = projection; raise failure from None
    return {'schema': 'helmut-w15-materials-capsule-readback/1', 'status': 'PASS_EXISTING_CAPSULE_READ_ONLY',
        'scope': SCOPE, 'exactCommit': expected_commit, 'nonce': request['nonce'],
        'sourceRun': SOURCE_RUN, 'sourceCommit': SOURCE_COMMIT, 'sourceArtifact': SOURCE_ARTIFACT,
        **projection, 'cipherPinVerified': True, 'gpgIntegrityVerified': True,
        'sourceContextVerified': True, 'independentManifestPinAvailable': False,
        'gpgAgentStopped': True, 'originalDataRead': False, 'databaseActions': 0,
        'unitExecutions': 0, 'modelCalls': 0, 'artifactUploads': 0,
        'completeBackupAccepted': False, 'mock500Acceptance': False, 'executionAuthority': False, 'retryAllowed': False}


def main(argv=None):
    class Parser(argparse.ArgumentParser):
        def error(self, message): raise CapsuleError('arguments')
    try:
        parser = Parser(add_help=False, allow_abbrev=False)
        group = parser.add_mutually_exclusive_group(required=True)
        group.add_argument('--admit-existing-capsule-readonly', action='store_true')
        group.add_argument('--read-existing-capsule-only', action='store_true')
        parser.add_argument('--expected-commit', required=True); parser.add_argument('--runner-temp', required=True)
        args = parser.parse_args(argv)
        raw = os.environ.get('W15_REQUEST'); need(type(raw) is str and 0 < len(raw.encode()) <= 16384)
        request = decode(raw)
        result = (admit if args.admit_existing_capsule_readonly else read_existing)(request, args.expected_commit, args.runner_temp)
        print(json.dumps(result, sort_keys=True)); return 0
    except BaseException as error:
        safe = {'status': 'FAIL_EXISTING_MATERIALS_CAPSULE_READ_ONLY',
                'phase': error.phase if isinstance(error, CapsuleError) else 'arguments',
                'executionAuthority': False, 'retryAllowed': False}
        if isinstance(error, CapsuleError) and error.projection is not None: safe.update(error.projection)
        print(json.dumps(safe, sort_keys=True)); return 1


if __name__ == '__main__': raise SystemExit(main())
