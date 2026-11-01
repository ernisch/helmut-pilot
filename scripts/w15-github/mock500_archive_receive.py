"""Receive-only handoff for the retained GPG/gzip/USTAR Mock originals.

Only the explicit CLI starts a receive. The same helpers are called again in
the later gated Mock job; this job's temporary files are never its data source.
No DB, controller, upload, key export, secret write or automatic retry.
"""
import sys
sys.dont_write_bytecode = True
import base64
from datetime import datetime, timedelta, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import time
import uuid

HERE = Path(__file__).absolute().parent
REPO = HERE.parents[1]


def load(name):
    spec = importlib.util.spec_from_file_location('w15_archive_handoff_' + name, HERE / (name + '.py'))
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


E = load('receive_existing_inputs')
V, N, A, P = E.V, E.N, E.A, E.P
MODE = 'mock500-receive-originals'
FORMAT = 'gpg-gzip-ustar-mock-originals/1'
INDEX_SCHEMA = 'helmut-w15-mock500-original-archive-url-index/1'
DRIVE_ID = '1koFG3XkeJr82wVNmMZwu94wgFFtBklor'
WALL_SECONDS = 600
PHASES = {'arguments', 'binding', 'approval', 'private-inputs', 'key-import',
          'outer-index', 'disk-admission', 'asset-download', 'asset-reception', 'agent-close'}
ARCHIVE_PHASES = {'arguments', 'cipher', 'recipient', 'destination', 'decrypt', 'gzip',
                  'archive', 'manifest', 'files', 'integrity', 'readback', 'cleanup'}


class ArchiveHandoffError(ValueError):
    def __init__(self, phase='arguments', *, archive_phase=None, process_stopped='UNKNOWN', agent_stopped='UNKNOWN'):
        self.phase = phase if phase in PHASES else 'arguments'
        self.archive_phase = archive_phase if archive_phase in ARCHIVE_PHASES else None
        self.process_stopped = process_stopped if process_stopped in ('PASS', 'UNKNOWN') else 'UNKNOWN'
        self.agent_stopped = agent_stopped if agent_stopped in ('PASS', 'UNKNOWN') else 'UNKNOWN'
        super().__init__('MOCK500_ARCHIVE_RECEIVE_FAILED_OR_UNKNOWN')


def need(value, phase='outer-index'):
    if not value: raise ArchiveHandoffError(phase)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True, allow_nan=False).encode('ascii')


def archive_description(value):
    """A separately versioned descriptor, never the legacy raw-tar manifest."""
    decoder = load('mock500_original_archive')
    need(type(value) is dict and set(value) == {'format', 'driveId', 'cipherBytes', 'cipherSHA256', 'manifestSHA256', 'url'}
         and value['format'] == FORMAT and value['driveId'] == DRIVE_ID
         and type(value['cipherBytes']) is int and value['cipherBytes'] == decoder.CIPHER['bytes']
         and value['cipherSHA256'] == decoder.CIPHER['sha256']
         and value['manifestSHA256'] == decoder.MANIFEST['sha256'])
    url = value['url']
    need(type(url) is str and 0 < len(url) <= 4096 and all(33 <= ord(c) <= 126 for c in url))
    parsed = E.urllib.parse.urlsplit(url)
    need(parsed.scheme == 'https' and re.fullmatch(r'[a-z0-9-]+\.oaiusercontent\.com(?::443)?', parsed.netloc)
         and parsed.username is None and parsed.password is None and parsed.port in (None, 443) and not parsed.fragment)
    return value


def checked_index(raw, commit, nonce, *, now=None):
    need(type(raw) is str and 0 < len(raw.encode('utf-8')) <= N.MAX_PLAINTEXT_BYTES)
    value = P.decode(raw)
    need(type(value) is dict and set(value) == {'schema', 'expectedCommit', 'nonce', 'createdAtUTC', 'expiresAtUTC', 'archive'}
         and value['schema'] == INDEX_SCHEMA and value['expectedCommit'] == commit and value['nonce'] == nonce)
    created, expires = E.utc(value['createdAtUTC']), E.utc(value['expiresAtUTC'])
    now = datetime.now(timezone.utc) if now is None else now
    need(timedelta(seconds=-60) <= now - created <= timedelta(minutes=30)
         and created < expires <= created + timedelta(minutes=30) and now < expires)
    return archive_description(value['archive']), expires


def download(root, archive, expires, *, guard):
    """One bounded GET, existing TLS/proxy/no-redirect/read1 primitives."""
    need(callable(guard), 'asset-download'); archive_description(archive)
    root = Path(root); path = root / 'mock-originals.PRIVATE.gpg'
    deadline = time.monotonic() + 300
    def remaining():
        guard(); seconds = deadline - time.monotonic()
        need(seconds > 0 and datetime.now(timezone.utc) < expires, 'asset-download')
        return min(seconds, 60)
    opener = E.urllib.request.build_opener(E.NoRedirect())
    request = E.urllib.request.Request(archive['url'], method='GET',
        headers={'Accept-Encoding': 'identity', 'User-Agent': 'Helmut-W15-readonly/1'})
    count, digest = 0, hashlib.sha256()
    with os.fdopen(A._file(root, path.name), 'wb') as stream, opener.open(request, timeout=remaining()) as response:
        need(response.status == 200 and response.geturl() == archive['url']
             and response.headers.get('Content-Encoding', 'identity') == 'identity', 'asset-download')
        need(response.headers.get('Content-Length') in (None, str(archive['cipherBytes'])), 'asset-download')
        while True:
            seconds = remaining()
            if response.fp is not None: response.fp.raw._sock.settimeout(seconds)
            block = response.read1(E.CHUNK); remaining()
            if not block: break
            count += len(block); need(count <= archive['cipherBytes'], 'asset-download')
            stream.write(block); digest.update(block)
        stream.flush(); os.fsync(stream.fileno())
    need(count == archive['cipherBytes'] and digest.hexdigest() == archive['cipherSHA256'], 'asset-download')
    fd = P.open_root(str(root))
    try: P.inspect_file(fd, path.name, {'bytes': count, 'sha256': archive['cipherSHA256']})
    finally: os.close(fd)
    guard()
    return path


def source_binding(commit):
    observed = E.source_binding(commit)
    # Bind all receiver helpers, including the newly introduced format decoder.
    args = ['/usr/bin/git', '--no-optional-locks', '-c', 'core.hooksPath=/dev/null',
            '-c', 'core.fsmonitor=false', '-c', 'safe.directory=' + str(REPO), '-C', str(REPO)]
    result = subprocess.run(args + ['ls-tree', '-r', '-z', commit, '--', 'scripts/w15-github'],
        stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, env=V.ENV, timeout=30)
    need(result.returncode == 0 and 0 < len(result.stdout) <= 1024 * 1024, 'binding')
    found = set()
    for row in result.stdout.rstrip(b'\0').split(b'\0'):
        header, relative = row.split(b'\t'); mode, kind, digest = header.split()
        need(mode in (b'100644', b'100755') and kind == b'blob', 'binding')
        name = relative.decode('utf-8'); path = REPO / name
        need(not path.is_symlink() and path.stat().st_size <= 16 * 1024 * 1024, 'binding')
        raw = path.read_bytes()
        need(hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest().encode() == digest, 'binding')
        found.add(name)
    need({'scripts/w15-github/mock500_archive_receive.py', 'scripts/w15-github/mock500_original_archive.py'} <= found, 'binding')
    return observed


def validate_request(commit, request, inputs, *, now=None):
    need(type(request) is dict and set(request) == {'schema', 'scope', 'authorized', 'exactCommit', 'branch',
         'nonce', 'runAttempt', 'archiveSHA256', 'maximumWallSeconds', 'maxReceiveAttempts', 'issuedAt', 'expiresAt'}
         and request['schema'] == 'helmut-w15-mock-originals-receive-approval/1'
         and request['scope'] == 'ISOLATED_GITHUB_MOCK_ORIGINALS_RECEIVE_ONLY' and request['authorized'] is True
         and request['exactCommit'] == commit and request['branch'] == V.BRANCH
         and type(request['runAttempt']) is int and request['runAttempt'] == 1
         and type(request['maximumWallSeconds']) is int and request['maximumWallSeconds'] == WALL_SECONDS
         and type(request['maxReceiveAttempts']) is int and request['maxReceiveAttempts'] == 1
         and request['archiveSHA256'] == load('mock500_original_archive').CIPHER['sha256'], 'approval')
    nonce = uuid.UUID(request['nonce'])
    need(str(nonce) == request['nonce'] and nonce.version == 4 and nonce.variant == uuid.RFC_4122, 'approval')
    now = datetime.now(timezone.utc) if now is None else now
    issued, expires = E.utc(request['issuedAt']), E.utc(request['expiresAt'])
    need(issued <= now < expires and timedelta(0) < expires - issued <= timedelta(hours=2), 'approval')
    need(type(inputs) is dict and inputs.get('w15_mode') == MODE and inputs.get('expected_commit') == commit
         and P.decode(inputs.get('w15_request', '')) == request, 'approval')
    N.check_event(commit, inputs['w15_cipher_index'], mode=MODE,
        extra_inputs={'w15_request': inputs['w15_request']})
    return request['nonce']


def receive_only(commit, runner_temp):
    phase, failure, answer, home = 'binding', None, None, None
    archive_phase, process_stopped, agent_stopped = None, 'UNKNOWN', 'UNKNOWN'
    started = time.monotonic()
    def guard():
        need(0 <= time.monotonic() - started < WALL_SECONDS, phase)
    try:
        observed = source_binding(commit)
        with open(os.environ['GITHUB_EVENT_PATH'], 'rb') as stream: raw_event = stream.read(1024 * 1024 + 1)
        need(len(raw_event) <= 1024 * 1024, 'approval')
        inputs = P.decode(raw_event)['inputs']; phase = 'approval'
        request = P.decode(inputs['w15_request']); nonce = validate_request(commit, request, inputs)
        phase = 'private-inputs'
        armored = os.environ.pop(N.ENV_NAME, None)
        need(armored == inputs['w15_cipher_index'], phase)
        key, secret = V.read_environment()
        A.resource.setrlimit(A.resource.RLIMIT_CORE, (0, 0))
        root = V.private_root(runner_temp); home = root / 'gnupg'; home.mkdir(mode=0o700)
        phase = 'key-import'; guard()
        A._run(root, home, 'key-import', ['--disable-dirmngr', '--import'], data=key, secret=secret)
        V.primary(A._run(root, home, 'secret-primary', ['--disable-dirmngr', '--with-colons', '--fingerprint', '--list-secret-keys']), 'sec')
        phase = 'outer-index'
        archive, expires = checked_index(N.decrypt_index(armored, root, home, secret), commit, nonce)
        with os.fdopen(A._file(root, 'receiver-passphrase.PRIVATE'), 'wb') as stream:
            stream.write(secret); stream.flush(); os.fsync(stream.fileno())
        phase = 'disk-admission'; decoder = load('mock500_original_archive')
        available = os.statvfs(root); available = available.f_bavail * available.f_frsize
        # Cipher, all payloads, manifest, tar framing and >=1GiB free reserve.
        need(available >= decoder.CIPHER['bytes'] + decoder.TOTAL + 65536 + 1024 ** 3, phase)
        phase = 'asset-download'; cipher = download(root, archive, expires, guard=guard)
        phase = 'asset-reception'
        received = decoder.receive(str(cipher), destination=str(root / 'received'), private_home=str(home),
            passphrase_file=str(root / 'receiver-passphrase.PRIVATE'), guard=guard)
        process_stopped = received['safe_receipt']['gpgProcessStopped']
        guard()
        answer = {**received['safe_receipt'], **observed, 'nonce': nonce,
            'status': 'PASS_MOCK_ORIGINALS_RECEIVED_ONLY_START_BLOCKED', 'mode': MODE,
            'persistentRunnerStorage': False, 'laterMockMustReceiveInSameJob': True,
            'executionAuthority': False, 'end500Acceptance': False, 'mock500Acceptance': False}
    except BaseException as error:
        failure = phase
        if phase == 'asset-reception':
            archive_phase = getattr(error, 'phase', None)
            process_stopped = getattr(error, 'process_stopped', 'UNKNOWN')
    finally:
        if home is not None:
            try:
                N._close_agent(home)
                agent_stopped = 'PASS'
            except BaseException: failure = failure or 'agent-close'
    if failure is not None or answer is None:
        raise ArchiveHandoffError(failure or phase, archive_phase=archive_phase,
            process_stopped=process_stopped, agent_stopped=agent_stopped) from None
    answer['gpgAgentStopped'] = agent_stopped
    return answer


def main():
    import argparse
    parser = argparse.ArgumentParser(description='Explicit separately approved Mock original reception only')
    parser.add_argument('--receive-mock-originals-only', action='store_true', required=True)
    parser.add_argument('--expected-commit', required=True)
    parser.add_argument('--runner-temp', required=True)
    args = parser.parse_args()
    def stopped(signum, frame): raise ArchiveHandoffError('arguments')
    previous = {s: signal.signal(s, stopped) for s in (signal.SIGTERM, signal.SIGINT, signal.SIGALRM)}
    signal.alarm(WALL_SECONDS)
    try:
        result = receive_only(args.expected_commit, args.runner_temp)
        print(json.dumps(result, sort_keys=True))
        return 0
    except BaseException as error:
        print(json.dumps({'status': 'FAIL_OR_BLOCKED_MOCK_ORIGINALS_RECEIVE',
            'phase': getattr(error, 'phase', 'arguments') if type(error) is ArchiveHandoffError else 'arguments',
            'archivePhase': error.archive_phase if type(error) is ArchiveHandoffError else None,
            'gpgProcessStopped': error.process_stopped if type(error) is ArchiveHandoffError else 'UNKNOWN',
            'gpgAgentStopped': error.agent_stopped if type(error) is ArchiveHandoffError else 'UNKNOWN',
            'executionAuthority': False, 'mock500Acceptance': False}, sort_keys=True))
        return 1
    finally:
        signal.alarm(0)
        for signum, handler in previous.items(): signal.signal(signum, handler)


if __name__ == '__main__': sys.exit(main())
