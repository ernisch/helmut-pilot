"""One same-job original+11-asset receive, called only by the gated worker.

No CLI, environment-secret mutation, crypto implementation or retry. Existing
GPG, original receiver, relocation and authenticated archive decoder are reused.
Only closed errors and the separate safe_receipt may leave the private caller.
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
import time
import uuid

HERE = Path(__file__).absolute().parent
REPO = HERE.parents[1]


def _load(name):
    spec = importlib.util.spec_from_file_location('w15_mock_receiver_' + name, HERE / (name + '.py'))
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


E, B, I = _load('receive_existing_inputs'), _load('restore_backup'), _load('mock500_inputs')
V, N, A, P, R, IP = E.V, E.N, E.A, E.P, E.R, E.IP
MODE = 'mock500-full-gated'
SCOPE = 'ISOLATED_GITHUB_MOCK500_INPUTS_ONLY'
ASSET_KEYS = frozenset(I.ASSETS - {'originalReception'})
SOURCE_KEYS = {'schema', 'scope', 'nonce', 'exactCommit', 'runId', 'runAttempt',
               'inputManifestSHA', 'recipientFingerprint', 'executionAuthority'}
PHASES = {'arguments', 'binding', 'private-inputs', 'key-import', 'outer-index', 'original-download',
          'original-reception', 'original-relocation', 'asset-download', 'asset-reception', 'asset-readback', 'agent-close'}


class MockReceiveError(ValueError):
    def __init__(self, phase='arguments'):
        self.phase = phase if phase in PHASES else 'arguments'
        super().__init__('MOCK500_RECEIVE_FAILED_OR_UNKNOWN')


def need(value, phase='outer-index'):
    if not value: raise MockReceiveError(phase)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True, allow_nan=False).encode('ascii')


def _url(value):
    need(type(value) is str and 0 < len(value) <= 4096 and all(33 <= ord(c) <= 126 for c in value))
    parsed = E.urllib.parse.urlsplit(value)
    need(parsed.scheme == 'https' and re.fullmatch(r'[a-z0-9-]+\.oaiusercontent\.com(?::443)?', parsed.netloc)
         and parsed.username is None and parsed.password is None and parsed.port in (None, 443) and not parsed.fragment)
    return value


def checked_index(raw, commit, *, input_binding_sha256, additional_asset_bytes, now=None):
    """Check every declared byte/context before either original or asset GET."""
    need(type(raw) is str and 0 < len(raw.encode()) <= 49151)
    need(type(commit) is str and re.fullmatch('[a-f0-9]{40}', commit))
    need(type(input_binding_sha256) is str and re.fullmatch('[a-f0-9]{64}', input_binding_sha256)
         and type(additional_asset_bytes) is int and 0 < additional_asset_bytes <= B.Q.MAX_SELECTION_BYTES)
    value = P.decode(raw)
    need(type(value) is dict and set(value) == {'schema', 'expectedCommit', 'createdAtUTC', 'expiresAtUTC', 'original', 'assets', 'inputBinding'}
         and value['schema'] == 'helmut-w15-mock500-private-url-index/1' and value['expectedCommit'] == commit)
    now = datetime.now(timezone.utc) if now is None else now
    created, expires = E.utc(value['createdAtUTC']), E.utc(value['expiresAtUTC'])
    need(timedelta(seconds=-60) <= now - created <= timedelta(minutes=30)
         and created < expires <= created + timedelta(minutes=30) and now < expires)
    need(type(value['original']) is dict)
    original_urls, original_expires = E.url_index(canonical(value['original']).decode(), commit, now)
    binding_text = value['inputBinding']
    need(type(binding_text) is str and 0 < len(binding_text.encode()) <= 32768)
    binding_raw = binding_text.encode('utf-8')
    need(hashlib.sha256(binding_raw).hexdigest() == input_binding_sha256)
    binding = P.decode(binding_raw)
    need(type(binding) is dict and binding_raw == canonical(binding) and set(binding) == {
        'schema', 'scope', 'status', 'exactCommit', 'assets', 'sourceComparison', 'executionAuthority', 'testStarted'}
         and binding['schema'] == 'helmut-w15-mock500-static-input-binding/1'
         and binding['scope'] == 'ISOLATED_GITHUB_MOCK500_INPUTS_ONLY'
         and binding['status'] == 'PASS_INDEPENDENT_MOCK500_INPUT_BINDING_ONLY'
         and binding['exactCommit'] == commit and binding['executionAuthority'] is False and binding['testStarted'] is False
         and type(binding['assets']) is dict and set(binding['assets']) == I.ASSETS)
    files = []
    for key in sorted(I.ASSETS):
        pin = binding['assets'][key]
        need(type(pin) is dict and set(pin) == {'bytes', 'sha256'} and type(pin['bytes']) is int
             and 0 < pin['bytes'] <= I.MAX_FILE and type(pin['sha256']) is str and re.fullmatch('[a-f0-9]{64}', pin['sha256']))
        if key in ASSET_KEYS: files.append({'path': 'assets/' + key + '.PRIVATE', **pin})
    need(len(files) == 11 and sum(pin['bytes'] for pin in files) == additional_asset_bytes)
    need(binding['assets']['originalReception'] == {'bytes': 12357,
         'sha256': '2cee6eb467342cabbe28db958ac00cc6cd9699622c3a772796d68d2d6adb97f1'})
    compared = binding['sourceComparison']
    need(type(compared) is dict and set(compared) == {'status', 'originalSourceChecks', 'currentSourceChecks',
        'qualificationSHA256', 'sourceDatesRewritten', 'originalsUnchanged'}
         and compared['status'] == 'PASS_INDEPENDENT_ORIGINAL16_CURRENT2_SOURCE_COMPARISON'
         and type(compared['originalSourceChecks']) is int and compared['originalSourceChecks'] == 16
         and type(compared['currentSourceChecks']) is int and compared['currentSourceChecks'] == 2
         and compared['qualificationSHA256'] == binding['assets']['qualificationReport']['sha256']
         and compared['sourceDatesRewritten'] is False and compared['originalsUnchanged'] is True)
    assets = value['assets']
    need(type(assets) is dict and set(assets) == {'sourceContext', 'manifestSHA256', 'cipherBytes', 'cipherSHA256', 'parts'})
    source = assets['sourceContext']
    need(type(source) is dict and set(source) == SOURCE_KEYS and source['schema'] == 'helmut-w15-backup-context/1'
         and source['scope'] == SCOPE and source['recipientFingerprint'] == V.FINGERPRINT
         and source['executionAuthority'] is False and type(source['runAttempt']) is int and source['runAttempt'] == 1
         and type(source['exactCommit']) is str and re.fullmatch('[a-f0-9]{40}', source['exactCommit'])
         and type(source['runId']) is str and re.fullmatch('[1-9][0-9]{4,19}', source['runId'])
         and source['inputManifestSHA'] == hashlib.sha256(canonical(files)).hexdigest())
    nonce = uuid.UUID(source['nonce'])
    need(str(nonce) == source['nonce'] and nonce.version == 4 and nonce.variant == uuid.RFC_4122)
    manifest = {'version': 1, **{key: source[key] for key in ('exactCommit', 'runId', 'runAttempt', 'inputManifestSHA', 'recipientFingerprint')}, 'files': files}
    manifest_raw = canonical(manifest) + b'\n'
    need(type(assets['manifestSHA256']) is str and hashlib.sha256(manifest_raw).hexdigest() == assets['manifestSHA256']
         and type(assets['cipherBytes']) is int and 0 < assets['cipherBytes'] <= B.Q.MAX_CIPHER_BYTES
         and type(assets['cipherSHA256']) is str and re.fullmatch('[a-f0-9]{64}', assets['cipherSHA256'])
         and type(assets['parts']) is list and 0 < len(assets['parts']) <= 64)
    urls, pins = [], []
    for index, part in enumerate(assets['parts'], 1):
        need(type(part) is dict and set(part) == {'index', 'url', 'bytes', 'sha256'}
             and type(part['index']) is int and part['index'] == index and type(part['bytes']) is int
             and 0 < part['bytes'] <= 16777216 and type(part['sha256']) is str and re.fullmatch('[a-f0-9]{64}', part['sha256']))
        urls.append(_url(part['url'])); pins.append({key: part[key] for key in ('index', 'bytes', 'sha256')})
    need(len(set(urls)) == len(urls) and sum(pin['bytes'] for pin in pins) == assets['cipherBytes'])
    return {'original_urls': original_urls, 'original_expires': min(expires, original_expires),
        'asset_urls': urls, 'asset_pins': pins, 'asset_expires': expires,
        'source_context': source, 'source_manifest': manifest, 'source_manifest_raw': manifest_raw,
        'manifest_sha256': assets['manifestSHA256'], 'cipher_bytes': assets['cipherBytes'],
        'cipher_sha256': assets['cipherSHA256'], 'binding_raw': binding_raw}


def download_assets(root, urls, expires, pins, *, cipher_bytes, cipher_sha256, guard):
    """Existing no-redirect/read1/TLS primitives, one bounded attempt per part."""
    need(callable(guard), 'asset-download')
    root = Path(root); opener = E.urllib.request.build_opener(E.NoRedirect())
    deadline = time.monotonic() + 300; total = 0; whole = hashlib.sha256()
    with os.fdopen(A._file(root, 'assets-cipher.PRIVATE.gpg'), 'wb') as joined:
        for url, pin in zip(urls, pins, strict=True):
            part_deadline = min(deadline, time.monotonic() + 60)
            def remaining():
                guard(); seconds = part_deadline - time.monotonic()
                need(seconds > 0 and datetime.now(timezone.utc) < expires, 'asset-download')
                return seconds
            request = E.urllib.request.Request(url, method='GET', headers={'Accept-Encoding': 'identity', 'User-Agent': 'Helmut-W15-readonly/1'})
            count, digest = 0, hashlib.sha256()
            with os.fdopen(A._file(root, 'asset-part-' + str(pin['index']).zfill(2) + '.PRIVATE.gpg'), 'wb') as output, \
                    opener.open(request, timeout=remaining()) as response:
                need(response.status == 200 and response.geturl() == url
                     and response.headers.get('Content-Encoding', 'identity') == 'identity', 'asset-download')
                length = response.headers.get('Content-Length')
                need(length is None or length == str(pin['bytes']), 'asset-download')
                while True:
                    seconds = remaining()
                    if response.fp is not None: response.fp.raw._sock.settimeout(seconds)
                    block = response.read1(E.CHUNK); remaining()
                    if not block: break
                    count += len(block); total += len(block)
                    need(count <= pin['bytes'] and total <= cipher_bytes, 'asset-download')
                    output.write(block); joined.write(block); digest.update(block); whole.update(block)
                output.flush(); os.fsync(output.fileno())
            need(count == pin['bytes'] and digest.hexdigest() == pin['sha256'], 'asset-download'); remaining()
        joined.flush(); os.fsync(joined.fileno())
    need(total == cipher_bytes and whole.hexdigest() == cipher_sha256, 'asset-download')
    fd = P.open_root(str(root))
    try:
        for pin in pins: P.inspect_file(fd, 'asset-part-' + str(pin['index']).zfill(2) + '.PRIVATE.gpg', pin)
        P.inspect_file(fd, 'assets-cipher.PRIVATE.gpg', {'bytes': cipher_bytes, 'sha256': cipher_sha256})
        os.fsync(fd)
    finally: os.close(fd)
    return root / 'assets-cipher.PRIVATE.gpg'


def prepare_inputs(context, private_payload, *, input_binding_sha256, additional_asset_bytes, guard, repo=REPO):
    """PRIVATE result after confirmed agent-close; never serialize this dict."""
    phase, home, failure, answer = 'arguments', None, None, None
    try:
        need(callable(guard) and type(context) is dict and context.get('schema') == 'helmut-w15-mock500-controller-context/1'
             and context.get('scope') == 'ISOLATED_GITHUB_MOCK500_BINDING_ONLY'
             and type(additional_asset_bytes) is int and additional_asset_bytes > 0
             and type(input_binding_sha256) is str and re.fullmatch('[a-f0-9]{64}', input_binding_sha256)
             and type(context.get('runAttempt')) is int and context['runAttempt'] == 1
             and Path(repo).absolute() == E.REPO.absolute(), phase)
        commit = context['exactCommit']; phase = 'binding'; guard()
        observed = E.source_binding(commit); original_pins = E.projection()
        need(all(observed[key] == context[key] for key in ('exactCommit', 'runId', 'runAttempt')) and context['runAttempt'] == 1, phase)
        phase = 'private-inputs'
        need(type(private_payload) is dict and {'cipherIndex', 'keyB64', 'passphrase', 'eventInputs'} <= set(private_payload), phase)
        armored, inputs = private_payload['cipherIndex'], private_payload['eventInputs']
        need(type(inputs) is dict and set(inputs) == {'w15_mode', 'expected_commit', 'w15_request', 'w15_cipher_index'}
             and inputs['w15_mode'] == MODE and inputs['expected_commit'] == commit
             and inputs['w15_cipher_index'] == armored and type(inputs['w15_request']) is str, phase)
        N.check_event(commit, armored, mode=MODE, extra_inputs={'w15_request': inputs['w15_request']}, event_inputs=inputs)
        encoded, passphrase = private_payload['keyB64'], private_payload['passphrase']
        need(type(encoded) is str and 0 < len(encoded) <= 49152 and type(passphrase) is str, phase)
        key, secret = base64.b64decode(encoded, validate=True), passphrase.encode('utf-8')
        need(0 < len(key) <= 36864 and 0 < len(secret) <= 4096 and not any(c in secret for c in (b'\0', b'\r', b'\n')), phase)
        root = V.private_root(context['runnerTemp']); home = root / 'gnupg'; home.mkdir(mode=0o700)
        A.resource.setrlimit(A.resource.RLIMIT_CORE, (0, 0))
        phase = 'key-import'; guard()
        A._run(root, home, 'key-import', ['--disable-dirmngr', '--import'], data=key, secret=secret)
        V.primary(A._run(root, home, 'secret-primary', ['--disable-dirmngr', '--with-colons', '--fingerprint', '--list-secret-keys']), 'sec')
        phase = 'outer-index'
        index = checked_index(N.decrypt_index(armored, root, home, secret), commit,
            input_binding_sha256=input_binding_sha256, additional_asset_bytes=additional_asset_bytes)
        with os.fdopen(A._file(root, 'receiver-passphrase.PRIVATE'), 'wb') as stream:
            stream.write(secret); stream.flush(); os.fsync(stream.fileno())
        phase = 'original-download'; guard()
        cipher = E.download(root, index['original_urls'], index['original_expires'], original_pins, guard=guard)
        phase = 'original-reception'
        received = R.receive(str(cipher), cipher_sha256=E.CIPHER_SHA, cipher_bytes=E.TOTAL, destination=str(root / 'received'),
            private_home=str(home), passphrase_file=str(root / 'receiver-passphrase.PRIVATE'),
            exact_commit=E.SOURCE['exactCommit'], run_id=E.SOURCE['runId'], input_manifest_sha256=E.SOURCE['inputManifestSHA'],
            recipient_fingerprint=V.FINGERPRINT)
        need(received['sealedManifestSHA256'] == E.SEALED_SHA, phase)
        phase = 'original-relocation'
        relocated = IP.verify_received(str(root / 'received'), expected_transfer_context=E.SOURCE,
            expected_sealed_manifest_sha256=E.SEALED_SHA, checkout_commit=commit, repo=Path(repo)).safe_summary()
        need(relocated['verifiedFiles'] == 12 and relocated['verifiedBytes'] == 242570240
             and relocated['checkoutCommit'] == commit and relocated['transferContext'] == E.SOURCE
             and relocated['originalPathFieldsModified'] is False, phase)
        phase = 'asset-download'; guard()
        asset_cipher = download_assets(root, index['asset_urls'], index['asset_expires'], index['asset_pins'],
            cipher_bytes=index['cipher_bytes'], cipher_sha256=index['cipher_sha256'], guard=guard)
        phase = 'asset-reception'
        asset_root = root / 'assets-received'
        authenticated = B.authenticated_readback(asset_cipher, cipher_bytes=index['cipher_bytes'], cipher_sha256=index['cipher_sha256'],
            expected_manifest=index['source_manifest'], expected_manifest_sha256=index['manifest_sha256'],
            context=index['source_context'], destination=str(asset_root), private_home=str(home),
            passphrase_file=str(root / 'receiver-passphrase.PRIVATE'), guard=guard, backup_scope=SCOPE)
        need(type(authenticated.get('verifiedFiles')) is int and authenticated['verifiedFiles'] == 11
             and type(authenticated.get('verifiedBytes')) is int and authenticated['verifiedBytes'] == additional_asset_bytes
             and authenticated.get('localAuthenticatedReadbackObserved') is True, phase)
        phase = 'asset-readback'; guard()
        fd = P.open_root(str(asset_root))
        try:
            expected = {row['path'] for row in index['source_manifest']['files']} | {'manifest.PRIVATE.json'}
            files, directories = P.tree_files(fd)
            need(files == expected and directories == {'assets'}, phase)
            for pin in index['source_manifest']['files']: P.inspect_file(fd, pin['path'], pin)
            P.inspect_file(fd, 'manifest.PRIVATE.json', {'bytes': len(index['source_manifest_raw']), 'sha256': index['manifest_sha256']})
        finally: os.close(fd)
        guard()
        answer = {'received_root': root / 'received',
            'asset_paths': {key: asset_root / 'assets' / (key + '.PRIVATE') for key in ASSET_KEYS},
            'binding_raw': index['binding_raw'], 'receiver_home': home, 'passphrase_file': root / 'receiver-passphrase.PRIVATE',
            'safe_receipt': {'verifiedFiles': relocated['verifiedFiles'], 'verifiedBytes': relocated['verifiedBytes'],
                'additionalFiles': authenticated['verifiedFiles'], 'additionalBytes': authenticated['verifiedBytes'], 'originalsUnchanged': True}}
    except BaseException:
        failure = phase
    finally:
        if home is not None:
            try: N._close_agent(home)
            except BaseException: failure = failure or 'agent-close'
    if failure is not None or answer is None: raise MockReceiveError(failure or phase) from None
    return answer
