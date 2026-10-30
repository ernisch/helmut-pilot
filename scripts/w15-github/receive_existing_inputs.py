"""Receive the existing pinned 15-part cipher once; never start W15 or a DB.

URLs and receiver inputs stay private. Only closed phase codes reach stdout.
The historical authenticated transfer context is distinct from this consumer run.
"""
import sys
sys.dont_write_bytecode = True

from datetime import datetime, timedelta, timezone
import base64
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import time
import urllib.parse
import urllib.request

HERE = Path(__file__).absolute().parent
REPO = HERE.parents[1]


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, HERE / filename)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


V = load('w15_existing_input_receiver_key', 'verify_receiver_key.py')
IP = load('w15_existing_input_port', 'input_port.py')
R, A, P = IP.R, V.A, V.P
N = load('w15_existing_encrypted_index', 'encrypted_index.py')
INDEX_NAME = N.ENV_NAME
PROJECTION = 'docs/betrieb/belege/w15-end500-transfer-20261029/RECEIVED_SOURCE.SAFE.json'
TOTAL = 242693044
CIPHER_SHA = 'eeec60f6f97f35b143f9fca22fae653ea9c8695a23d712c9fc74c1979e410231'
SEALED_SHA = 'af3bd654fa292ad256e0fa265c2fb3d968e945633f1439a12da72f015aeab86f'
SOURCE = {'exactCommit': '66efb89a42e3d1bee739844ac32a258d79b38ebb', 'runId': '20261029010443',
          'inputManifestSHA': '84b730490014c5d17f81ac350677275ce33f368731c8f4a979a4d1b2c9165bf5',
          'recipientFingerprint': V.FINGERPRINT}
PHASES = frozenset(('arguments', 'source-binding', 'private-inputs', 'index', 'disk-admission',
                    'key-import', 'encrypted-index', 'download', 'cipher-readback', 'authenticated-reception', 'relocation', 'agent-close'))
PHASE = 'arguments'
CHUNK = 1024 * 1024


def need(value):
    if not value: raise ValueError('EXISTING_INPUT_RECEPTION_REJECTED')


def phase(value):
    global PHASE
    need(value in PHASES); PHASE = value


def source_binding(commit):
    binding = V.bind_runtime(commit)
    files = ['scripts/w15-github/' + name for name in ('receive_existing_inputs.py', 'receive.py', 'input_port.py',
             'seal.py', 'source-export-request.json', 'encrypted_index.py')]
    files += ['.github/workflows/ci.yml']
    files += [PROJECTION] + [IP._REPORT_ROOT + row[1] for row in IP.PUBLIC_PROVENANCE]
    argv = ['/usr/bin/git', '--no-optional-locks', '-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false',
            '-c', 'safe.directory=' + str(REPO), '-C', str(REPO), 'ls-tree', '-z', commit, '--'] + files
    result = subprocess.run(argv, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                            env=V.ENV, timeout=30, close_fds=True)
    need(result.returncode == 0 and len(result.stdout) <= 65536)
    entries = {}
    for item in result.stdout.rstrip(b'\0').split(b'\0'):
        header, name = item.split(b'\t'); mode, kind, digest = header.split()
        need(mode in (b'100644', b'100755') and kind == b'blob' and name.decode() not in entries)
        entries[name.decode()] = digest
    need(set(entries) == set(files))
    for name in files:
        path = REPO / name; need(not path.is_symlink() and path.stat().st_size <= 1024 * 1024)
        raw = path.read_bytes()
        need(hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest().encode() == entries[name])
    IP.public_provenance(REPO)
    return binding


def projection():
    value = P.decode((REPO / PROJECTION).read_bytes())
    cipher, receipt = value['cipher'], value['authenticatedReception']
    need(cipher['bytes'] == TOTAL and cipher['sha256'] == CIPHER_SHA and len(cipher['parts']) == 15)
    for index, row in enumerate(cipher['parts'], 1):
        need(set(row) == {'index', 'bytes', 'sha256'} and type(row['index']) is int and row['index'] == index
             and type(row['bytes']) is int and 0 < row['bytes'] <= 16777216
             and isinstance(row['sha256'], str) and re.fullmatch('[a-f0-9]{64}', row['sha256']))
    need(sum(row['bytes'] for row in cipher['parts']) == TOTAL
         and all(receipt[key] == val for key, val in SOURCE.items())
         and receipt['sealedManifestSHA256'] == SEALED_SHA and receipt['runAttempt'] == 1
         and receipt['verifiedFiles'] == 12 and receipt['verifiedBytes'] == 242570240)
    return cipher['parts']


def utc(value):
    need(type(value) is str and re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)', value))
    return datetime.fromisoformat(value.replace('Z', '+00:00'))


def url_index(raw, commit, now=None):
    need(type(raw) is str and 0 < len(raw.encode('utf-8')) < 49152)
    value = P.decode(raw)
    need(type(value) is dict and set(value) == {'schema', 'expectedCommit', 'createdAtUTC', 'expiresAtUTC', 'parts'}
         and value['schema'] == 'helmut-w15-private-cipher-url-index/1' and value['expectedCommit'] == commit)
    created, expires = utc(value['createdAtUTC']), utc(value['expiresAtUTC'])
    now = datetime.now(timezone.utc) if now is None else now
    need(timedelta(seconds=-60) <= now - created <= timedelta(minutes=30)
         and created < expires <= created + timedelta(minutes=30) and now < expires)
    rows = value['parts']; need(type(rows) is list and len(rows) == 15)
    urls = []
    for index, row in enumerate(rows, 1):
        need(type(row) is dict and set(row) == {'index', 'url'} and type(row['index']) is int and row['index'] == index)
        url = row['url']
        need(type(url) is str and 0 < len(url) <= 4096 and all(33 <= ord(char) <= 126 for char in url))
        parsed = urllib.parse.urlsplit(url)
        need(parsed.scheme == 'https' and re.fullmatch(r'[a-z0-9-]+\.oaiusercontent\.com(?::443)?', parsed.netloc)
             and parsed.username is None and parsed.password is None and parsed.port in (None, 443) and not parsed.fragment)
        urls.append(url)
    need(len(set(urls)) == 15)
    return urls, expires


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('REDIRECT_REJECTED')


def download(root, urls, expires, pins, *, guard=None, phase_observer=None):
    # Default proxy and TLS verification are preserved; redirects are prohibited.
    opener = urllib.request.build_opener(NoRedirect())
    deadline = time.monotonic() + 300
    whole = hashlib.sha256(); total = 0
    concat_fd = A._file(root, 'source-cipher.PRIVATE.gpg')
    try:
        with os.fdopen(concat_fd, 'wb') as concat:
            for url, pin in zip(urls, pins, strict=True):
                part_deadline = min(deadline, time.monotonic() + 60)
                def remaining():
                    if guard is not None:
                        guard()
                    value = part_deadline - time.monotonic()
                    need(value > 0 and datetime.now(timezone.utc) < expires)
                    return value
                request = urllib.request.Request(url, method='GET', headers={'Accept-Encoding': 'identity', 'User-Agent': 'Helmut-W15-readonly/1'})
                fd = A._file(root, 'part-' + str(pin['index']).zfill(2) + '.PRIVATE.pgp')
                count, digest = 0, hashlib.sha256()
                with os.fdopen(fd, 'wb') as output, opener.open(request, timeout=remaining()) as response:
                    need(response.status == 200 and response.geturl() == url
                         and response.headers.get('Content-Encoding', 'identity') == 'identity')
                    length = response.headers.get('Content-Length')
                    need(length is None or length == str(pin['bytes']))
                    while True:
                        # read1 performs one underlying read; do not accumulate a
                        # dribbling response inside read(CHUNK) past the deadline.
                        timeout = remaining()
                        if response.fp is not None:
                            response.fp.raw._sock.settimeout(timeout)
                        block = response.read1(CHUNK)
                        remaining()
                        if not block: break
                        count += len(block); total += len(block)
                        need(count <= pin['bytes'] and total <= TOTAL)
                        output.write(block); concat.write(block); digest.update(block); whole.update(block)
                    output.flush(); os.fsync(output.fileno())
                need(count == pin['bytes'] and digest.hexdigest() == pin['sha256'])
                remaining()
            concat.flush(); os.fsync(concat.fileno())
        need(total == TOTAL and whole.hexdigest() == CIPHER_SHA)
    finally:
        # os.fdopen owns the descriptor after successful construction.
        pass
    phase('cipher-readback')
    if phase_observer is not None:
        phase_observer('receiver-cipher-readback')
    parent = P.open_root(str(root))
    try:
        for pin in pins:
            P.inspect_file(parent, 'part-' + str(pin['index']).zfill(2) + '.PRIVATE.pgp', pin)
        P.inspect_file(parent, 'source-cipher.PRIVATE.gpg', {'bytes': TOTAL, 'sha256': CIPHER_SHA})
        os.fsync(parent)
    finally: os.close(parent)
    return root / 'source-cipher.PRIVATE.gpg'


def _receive_existing_verified(commit, runner_temp, *, private_payload=None, mode=N.MODE, guard=None, phase_observer=None):
    """Internal same-process handoff; never expose this private path in output.

    The received tree remains available to a later, separately authorized local
    consumer in this job. No path is returned until the owned GPG agent closes.
    """
    def enter(value):
        phase(value)
        if phase_observer is not None:
            phase_observer('receiver-' + value)
    enter('source-binding'); binding = source_binding(commit); pins = projection()
    enter('private-inputs')
    if private_payload is None:
        need(mode == N.MODE)
        armored_index = os.environ.pop(INDEX_NAME, None)
        key, secret = V.read_environment()
        enter('encrypted-index'); input_chars = N.check_event(commit, armored_index)
    else:
        need(mode in ('end500-restore-gated', 'end500-full-gated', 'end500-restore-export-diagnostic', 'end500-restore-capacity-diagnostic') and isinstance(private_payload, dict))
        armored_index = private_payload['cipherIndex']
        encoded, passphrase = private_payload['keyB64'], private_payload['passphrase']
        need(type(encoded) is str and 0 < len(encoded) <= 49152 and type(passphrase) is str)
        key, secret = base64.b64decode(encoded, validate=True), passphrase.encode('utf-8')
        need(0 < len(key) <= 36864 and 0 < len(secret) <= 4096
             and not any(value in secret for value in (b'\0', b'\r', b'\n')))
        event_inputs = private_payload['eventInputs']
        enter('encrypted-index')
        input_chars = N.check_event(commit, armored_index, mode=mode,
            extra_inputs={'w15_request': event_inputs['w15_request']}, event_inputs=event_inputs)
    root = V.private_root(runner_temp)
    enter('disk-admission'); disk = os.statvfs(root); need(disk.f_bavail * disk.f_frsize >= 1024 ** 3)
    A.resource.setrlimit(A.resource.RLIMIT_CORE, (0, 0))
    home = root / 'gnupg'; home.mkdir(mode=0o700)
    failure = None
    try:
        enter('key-import')
        A._run(root, home, 'key-import', ['--disable-dirmngr', '--import'], data=key, secret=secret)
        V.primary(A._run(root, home, 'secret-primary', ['--disable-dirmngr', '--with-colons', '--fingerprint', '--list-secret-keys']), 'sec')
        enter('encrypted-index')
        raw_index = N.decrypt_index(armored_index, root, home, secret)
        enter('index'); urls, expires = url_index(raw_index, commit)
        with os.fdopen(A._file(root, 'receiver-passphrase.PRIVATE'), 'wb') as stream:
            stream.write(secret); stream.flush(); os.fsync(stream.fileno())
        enter('download')
        options = {}
        if guard is not None:
            options['guard'] = guard
        if phase_observer is not None:
            options['phase_observer'] = phase_observer
        cipher = download(root, urls, expires, pins, **options)
        enter('authenticated-reception')
        receipt = R.receive(str(cipher), cipher_sha256=CIPHER_SHA, cipher_bytes=TOTAL, destination=str(root / 'received'),
                            private_home=str(home), passphrase_file=str(root / 'receiver-passphrase.PRIVATE'),
                            exact_commit=SOURCE['exactCommit'], run_id=SOURCE['runId'], input_manifest_sha256=SOURCE['inputManifestSHA'],
                            recipient_fingerprint=SOURCE['recipientFingerprint'])
        need(receipt['sealedManifestSHA256'] == SEALED_SHA)
        enter('relocation')
        relocated = IP.verify_received(str(root / 'received'), expected_transfer_context=SOURCE,
                                      expected_sealed_manifest_sha256=SEALED_SHA, checkout_commit=commit, repo=REPO).safe_summary()
        need(relocated['verifiedFiles'] == 12 and relocated['verifiedBytes'] == 242570240
             and relocated['checkoutCommit'] == commit and relocated['transferContext'] == SOURCE)
    except BaseException:
        failure = PHASE
    finally:
        try:
            phase('agent-close')
            closed = subprocess.run([A._binary('gpgconf'), '--homedir', str(home), '--kill', 'gpg-agent'],
                                    stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                    env=V.ENV, timeout=15, close_fds=True)
            need(closed.returncode == 0)
        except BaseException: failure = failure or 'agent-close'
    if failure:
        phase(failure); raise ValueError('EXISTING_INPUT_RECEPTION_REJECTED')
    summary = {'status': 'PASS_EXISTING12_RECEIVED_AND_RELOCATED_ONLY_START_BLOCKED', **binding,
            'indexHandoff': 'GPG_WORKFLOW_INPUT_NO_SECRET_WRITE', 'workflowPayloadChars': input_chars,
            'verifiedFiles': 12, 'verifiedBytes': 242570240, 'cipherSHA256': CIPHER_SHA,
            'sealedManifestSHA256': SEALED_SHA, 'inputManifestSHA': SOURCE['inputManifestSHA'],
            'relocationVerified': True, 'fullRestoreAccepted': False, 'databaseStarted': False,
            'commonLifetimeMemoryAccepted': False, 'end500Acceptance': False, 'mock500Acceptance': False,
            'controllerStarted': False, 'executionAuthority': False, 'readiness': 'BLOCKED'}
    return root / 'received', summary


def receive_existing(commit, runner_temp):
    """Public receipt-only wrapper; private same-job paths never reach stdout."""
    _, summary = _receive_existing_verified(commit, runner_temp)
    return summary


def main(argv=None):
    try:
        phase('arguments')
        parser = P.Parser(description=__doc__, allow_abbrev=False)
        parser.add_argument('--receive-existing-inputs-only', action='store_true', required=True)
        parser.add_argument('--expected-commit', required=True); parser.add_argument('--runner-temp', required=True)
        args = parser.parse_args(argv)
        need(args.runner_temp.startswith('/') and args.runner_temp != '/')
        print(json.dumps(receive_existing(args.expected_commit, args.runner_temp), separators=(',', ':')))
        return 0
    except (Exception, KeyboardInterrupt):
        print(json.dumps({'status': 'FAIL_OR_BLOCKED_EXISTING_INPUT_RECEPTION', 'phase': PHASE,
                          'executionAuthority': False, 'readiness': 'BLOCKED'}, separators=(',', ':')))
        return 1


if __name__ == '__main__': raise SystemExit(main())
