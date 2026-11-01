"""GPG index envelope for the existing receiver; no dispatch or secret writes.

Only the fixed recipient and the existing GPG helpers are used. Workflow inputs
contain ASCII-armored ciphertext. Plaintext remains in a bounded private file.
"""
import sys
sys.dont_write_bytecode = True

import base64
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import resource
import subprocess

HERE = Path(__file__).absolute().parent
REPO = HERE.parents[1]
SPEC = importlib.util.spec_from_file_location('w15_index_existing_receiver', HERE / 'verify_receiver_key.py')
V = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(V)
A, P = V.A, V.P
SPEC = importlib.util.spec_from_file_location('w15_index_existing_seal', HERE / 'seal.py')
S = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(S)

INPUT_NAME = 'w15_cipher_index'
ENV_NAME = 'HELMUT_W15_CIPHER_INDEX_GPG'
MODE = 'end500-receive-inputs'
BRANCH = V.BRANCH.removeprefix('refs/heads/')
MAX_INPUT_CHARS = 65535
MAX_PLAINTEXT_BYTES = 49151
PUBLIC_KEY = REPO / 'docs/betrieb/belege/w15-end500-transfer-20261029/receiver-public.asc'
PUBLIC_KEY_SHA = '3075683711733f6c7fc5836c9b4f5f1d94eaf35dec7f9a401132f52995122443'


def need(value):
    if not value:
        raise ValueError('ENCRYPTED_INDEX_REJECTED')


def cipher_bytes(armored):
    need(type(armored) is str and 0 < len(armored) <= MAX_INPUT_CHARS and armored.isascii())
    lines = armored.splitlines()
    need(len(lines) >= 5 and lines[:2] == ['-----BEGIN PGP MESSAGE-----', '']
         and lines[-1] == '-----END PGP MESSAGE-----')
    rows = lines[2:-1]
    if rows and rows[-1].startswith('='):
        need(re.fullmatch(r'=[A-Za-z0-9+/]{4}', rows[-1]) is not None)
        rows = rows[:-1]
    need(rows and all(re.fullmatch(r'[A-Za-z0-9+/]{1,76}={0,2}', row) for row in rows))
    raw = base64.b64decode(''.join(rows), validate=True)
    need(len(raw) > 32 and raw[0] & 0x80)
    # The first packet must be a public-key encrypted session key, not literal
    # plaintext, a private-key packet or a password-only encrypted message.
    need((raw[0] & 0x3f if raw[0] & 0x40 else (raw[0] >> 2) & 15) == 1)
    return raw


def dispatch_payload(commit, armored, *, mode=MODE, extra_inputs=None):
    """Bound all actual inputs AND their serialized dispatch below 65,535 chars."""
    need(type(commit) is str and re.fullmatch('[a-f0-9]{40}', commit))
    cipher_bytes(armored)
    need(mode in (MODE, 'end500-restore-gated', 'end500-full-gated', 'end500-full-phased-gated', 'mock500-full-gated', 'mock500-full-phased-gated', 'mock500-receive-originals', 'end500-restore-export-diagnostic', 'end500-restore-capacity-diagnostic', 'end500-full-capacity-diagnostic', 'end500-full-functional-gated', 'end500-full-host-capacity-diagnostic', 'mock500-full-functional-gated','mock500-full-host-functional-gated'))
    need((mode == MODE and extra_inputs is None) or
         (mode != MODE and isinstance(extra_inputs, dict) and set(extra_inputs) == {'w15_request'}
          and type(extra_inputs['w15_request']) is str))
    inputs = {'w15_mode': mode, 'expected_commit': commit, INPUT_NAME: armored, **(extra_inputs or {})}
    payload = json.dumps({'ref': BRANCH, 'inputs': inputs}, ensure_ascii=True, separators=(',', ':'))
    need(sum(len(value) for value in inputs.values()) <= MAX_INPUT_CHARS
         and len(json.dumps(inputs, ensure_ascii=True, separators=(',', ':'))) <= MAX_INPUT_CHARS
         and len(payload) <= MAX_INPUT_CHARS)
    return payload.encode('ascii')


def check_event(commit, armored, *, mode=MODE, extra_inputs=None, event_inputs=None):
    """Verify the actual event input set, not only a copy passed via environment."""
    expected = json.loads(dispatch_payload(commit, armored, mode=mode, extra_inputs=extra_inputs))
    if event_inputs is not None:
        # Only the gated outer CLI may supply the actual event snapshot after
        # checking it before extracting secrets. The legacy path always reads
        # the event itself, unchanged.
        need(mode != MODE and type(event_inputs) is dict and event_inputs == expected['inputs'])
        return len(dispatch_payload(commit, armored, mode=mode, extra_inputs=extra_inputs))
    need(os.environ.get('GITHUB_EVENT_NAME') == 'workflow_dispatch')
    path = os.environ.get('GITHUB_EVENT_PATH')
    need(isinstance(path, str) and path.startswith('/'))
    with open(path, 'rb') as stream:
        raw = stream.read(1024 * 1024 + 1)
    need(len(raw) <= 1024 * 1024)
    event = P.decode(raw)
    need(type(event) is dict)
    if mode == MODE and event.get('inputs') == {**expected['inputs'], 'w15_request': ''}:
        # GitHub includes newly declared empty defaults in legacy dispatches.
        # Only this exact empty field is compatible; no hidden input is ignored.
        actual = json.dumps({'ref': BRANCH, 'inputs': event['inputs']}, ensure_ascii=True, separators=(',', ':'))
        need(len(actual) <= MAX_INPUT_CHARS)
        return len(actual)
    need(event.get('inputs') == expected['inputs'])
    return len(dispatch_payload(commit, armored, mode=mode, extra_inputs=extra_inputs))


def _close_agent(home):
    result = subprocess.run([A._binary('gpgconf'), '--homedir', str(home), '--kill', 'gpg-agent'],
                            stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                            stderr=subprocess.DEVNULL, env=V.ENV, timeout=15, close_fds=True)
    need(result.returncode == 0)


def encrypt_index(raw, commit, root, *, index_schema='helmut-w15-private-cipher-url-index/1'):
    """Encrypt only an index, using the existing pinned public recipient key."""
    need(type(raw) is str and 0 < len(raw.encode('utf-8')) <= MAX_PLAINTEXT_BYTES)
    value = P.decode(raw)
    need(index_schema in ('helmut-w15-private-cipher-url-index/1', 'helmut-w15-mock500-private-url-index/1',
                           'helmut-w15-mock500-original-archive-url-index/1'))
    need(type(value) is dict and value.get('schema') == index_schema
         and value.get('expectedCommit') == commit)
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    root = Path(root)
    checked = P.open_root(str(root))
    os.close(checked)
    home = root / 'index-encrypt-gnupg'
    home.mkdir(mode=0o700)
    try:
        public = S._read_public_key(str(PUBLIC_KEY))
        need(hashlib.sha256(public).hexdigest() == PUBLIC_KEY_SHA)
        S._import_public(str(home), public, V.FINGERPRINT)
        fd = A._file(root, 'download-index.ENCRYPTED.asc')
        try:
            result = subprocess.run(S._gpg_base(str(home)) + ['--disable-dirmngr', '--trust-model', 'always',
                                    '--no-emit-version', '--no-comments', '--armor', '--compress-algo', 'none',
                                    '--force-mdc', '--recipient', V.FINGERPRINT, '--encrypt'],
                                    input=raw.encode('utf-8'), stdout=fd, stderr=subprocess.DEVNULL,
                                    env=S._gpg_env(), timeout=30, close_fds=True)
            need(result.returncode == 0)
            os.fsync(fd)
        finally:
            os.close(fd)
        parent = P.open_root(str(root))
        try:
            armored = P.inspect_file(parent, 'download-index.ENCRYPTED.asc', retain_limit=MAX_INPUT_CHARS).decode('ascii')
        finally:
            os.close(parent)
        dispatch_payload(commit, armored)
        return armored
    finally:
        _close_agent(home)


def _child_limits():
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    resource.setrlimit(resource.RLIMIT_FSIZE, (MAX_PLAINTEXT_BYTES, MAX_PLAINTEXT_BYTES))


def decrypt_index(armored, root, home, secret):
    """Authenticated GPG output goes directly to an exclusive, bounded0600 file."""
    encrypted = cipher_bytes(armored)
    root, home = Path(root), Path(home)
    output = log = status = read_fd = write_fd = None
    try:
        output = A._file(root, 'cipher-url-index.PRIVATE.json')
        log = A._file(root, 'index-decrypt.PRIVATE.log')
        status = A._file(root, 'index-decrypt.PRIVATE.status')
        read_fd, write_fd = os.pipe()
        os.write(write_fd, secret + b'\n')
        os.close(write_fd)
        write_fd = None
        result = subprocess.run(A._gpg(home) + ['--disable-dirmngr', '--status-fd', str(status),
                                '--passphrase-fd', str(read_fd), '--decrypt'],
                                input=encrypted, stdout=output, stderr=log, pass_fds=(read_fd, status),
                                env=V.ENV, timeout=30, close_fds=True, preexec_fn=_child_limits)
        need(result.returncode == 0)
        for fd in (output, log, status):
            os.fsync(fd)
        parent = P.open_root(str(root))
        try:
            raw = P.inspect_file(parent, 'cipher-url-index.PRIVATE.json', retain_limit=MAX_PLAINTEXT_BYTES)
            observations = P.inspect_file(parent, 'index-decrypt.PRIVATE.status', retain_limit=MAX_PLAINTEXT_BYTES)
        finally:
            os.close(parent)
        rows = observations.decode('ascii').splitlines()
        keys = [line.split()[3] for line in rows if line.startswith('[GNUPG:] DECRYPTION_KEY ') and len(line.split()) == 5]
        need(keys == [V.FINGERPRINT] and '[GNUPG:] DECRYPTION_OKAY' in rows and '[GNUPG:] GOODMDC' in rows
             and 0 < len(raw) <= MAX_PLAINTEXT_BYTES)
        return raw.decode('utf-8')
    finally:
        for fd in (output, log, status, read_fd, write_fd):
            if fd is not None:
                os.close(fd)
