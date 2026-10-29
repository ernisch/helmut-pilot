"""Existing GitHub artifact channel, ciphertext only, in the common parent.

Official immutable action bundles perform upload and remote download. No secret
is passed in argv, written to an output or inherited by unrelated processes.
This module never receives, restores or retries an original-data test.
"""
import sys
sys.dont_write_bytecode = True

import hashlib
import os
from pathlib import Path
import re
import stat
import subprocess
import time
import urllib.request

TOOLS = {
    'upload': ('ea165f8d65b6e75b540449e92b4886f43607fa02', 'dist/upload/index.js',
               5051718, '0165b8a75330f3228f2c7a234b4ff8a107b9139c2b519147f4c8e9fe99b262d8'),
    'download': ('d3f86a106a0bac45b974a628896c90dbdf5c8093', 'dist/index.js',
                 4798714, '02c2cf24c5b60ae4b3f8d71d3cc85e2e6433dbdf106a38fee7ec3f1c96e2d18e')}
MAX_CIPHER_BYTES = 4 * 1024 ** 3
CREDENTIAL_KEYS = {'ACTIONS_RUNTIME_TOKEN', 'ACTIONS_RESULTS_URL', 'ACTIONS_RUNTIME_URL',
                   'GITHUB_TOKEN', 'GITHUB_API_URL', 'GITHUB_SERVER_URL',
                   'GITHUB_REPOSITORY', 'GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT'}


def need(value):
    if not value:
        raise ValueError('CIPHER_ARTIFACT_TRANSPORT_REJECTED')


def pin(path, guard):
    value = Path(path).lstat()
    need(stat.S_ISREG(value.st_mode) and value.st_nlink == 1 and value.st_uid == os.getuid()
         and stat.S_IMODE(value.st_mode) == 0o600 and 0 < value.st_size <= MAX_CIPHER_BYTES)
    digest, size = hashlib.sha256(), 0
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        while chunk := os.read(fd, 1024 * 1024):
            guard(); size += len(chunk); digest.update(chunk)
        after = os.fstat(fd)
        need(size == value.st_size and (value.st_dev, value.st_ino, value.st_size, value.st_mtime_ns, value.st_ctime_ns)
             == (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns))
    finally:
        os.close(fd)
    return {'cipherBytes': size, 'cipherSHA256': digest.hexdigest()}


def _tool(kind, root, guard):
    commit, source, size, digest = TOOLS[kind]
    url = 'https://raw.githubusercontent.com/actions/' + kind + '-artifact/' + commit + '/' + source
    output = root / (kind + '.js')
    hashed, count = hashlib.sha256(), 0
    with urllib.request.urlopen(url, timeout=45) as response, output.open('xb') as stream:
        os.chmod(output, 0o600)
        need(response.status == 200 and response.geturl() == url)
        while chunk := response.read(1024 * 1024):
            guard(); count += len(chunk); need(count <= size); hashed.update(chunk); stream.write(chunk)
        stream.flush(); os.fsync(stream.fileno())
    need(count == size and hashed.hexdigest() == digest)
    return output


def _run(node, tool, root, credentials, inputs, guard):
    need(isinstance(credentials, dict) and set(credentials) <= CREDENTIAL_KEYS
         and all(type(v) is str and '\0' not in v for v in credentials.values()))
    need(all(credentials.get(key) for key in ('ACTIONS_RUNTIME_TOKEN', 'ACTIONS_RESULTS_URL',
                                             'GITHUB_REPOSITORY', 'GITHUB_RUN_ID')))
    output, log = root / (tool.stem + '.output.PRIVATE'), root / (tool.stem + '.log.PRIVATE')
    env = {'PATH': '/usr/bin:/bin', 'LANG': 'C', 'LC_ALL': 'C', 'GITHUB_WORKSPACE': str(root),
           'RUNNER_TEMP': str(root), 'GITHUB_OUTPUT': str(output), **credentials}
    env.update({'INPUT_' + key.upper(): value for key, value in inputs.items()})
    with output.open('xb') as stream:
        os.chmod(output, 0o600)
    with log.open('xb') as stream:
        os.chmod(log, 0o600)
        child = subprocess.Popen([str(node), str(tool)], cwd=root, env=env,
            stdin=subprocess.DEVNULL, stdout=stream, stderr=stream, close_fds=True, start_new_session=True)
        started = time.monotonic()
        try:
            while child.poll() is None:
                guard()
                need(time.monotonic() - started <= 300 and log.stat().st_size <= 16 * 1024 ** 2
                     and output.stat().st_size <= 65536)
                time.sleep(.25)
            need(child.returncode == 0)
        finally:
            if child.poll() is None:
                # This process owns this fresh session; never kill by a name.
                import signal
                os.killpg(child.pid, signal.SIGKILL)
                child.wait(timeout=10)
    need(output.stat().st_size <= 65536)
    return output.read_text()


def _artifact_id(raw):
    """Parse bounded actual @actions/core file-command output, not console text."""
    need(type(raw) is str and len(raw.encode('utf-8')) <= 65536)
    lines, found, index = raw.splitlines(), [], 0
    while index < len(lines):
        line = lines[index]; index += 1
        if not line:
            continue
        if '<<' in line:
            name, delimiter = line.split('<<', 1)
            need(re.fullmatch('[A-Za-z0-9_-]+', name) and 0 < len(delimiter) <= 128)
            values = []
            while index < len(lines) and lines[index] != delimiter:
                values.append(lines[index]); index += 1
            need(index < len(lines)); index += 1
            value = '\n'.join(values)
        else:
            need('=' in line)
            name, value = line.split('=', 1)
            need(re.fullmatch('[A-Za-z0-9_-]+', name))
        if name == 'artifact-id':
            found.append(value)
    need(len(found) == 1 and re.fullmatch('[1-9][0-9]{0,19}', found[0]))
    return int(found[0])


def roundtrip(cipher, *, destination, node, credentials, guard):
    """One immutable artifact, retention one day, then a fresh remote readback.

    SDK-level transient chunk handling does not repeat a receive/restore/test.
    The caller must authenticate the downloaded GPG archive and restore it.
    """
    cipher, root = Path(cipher), Path(destination)
    expected = pin(cipher, guard)
    root.mkdir(mode=0o700)
    tools = {kind: _tool(kind, root, guard) for kind in TOOLS}
    name = 'w15-cipher-' + credentials['GITHUB_RUN_ID'] + '-' + expected['cipherSHA256'][:16]
    result = _run(node, tools['upload'], root, credentials,
        {'name': name, 'path': str(cipher), 'if-no-files-found': 'error', 'compression-level': '0',
         'retention-days': '1', 'overwrite': 'false', 'include-hidden-files': 'false'}, guard)
    artifact_id = _artifact_id(result)
    received = root / 'download'; received.mkdir(mode=0o700)
    _run(node, tools['download'], root, credentials,
        {'name': name, 'path': str(received), 'merge-multiple': 'false',
         'github-token': credentials.get('GITHUB_TOKEN', ''),
         'repository': credentials['GITHUB_REPOSITORY'], 'run-id': credentials['GITHUB_RUN_ID']}, guard)
    files = list(received.iterdir())
    need(len(files) == 1 and files[0].name == cipher.name and not files[0].is_symlink())
    os.chmod(files[0], 0o600)
    need(pin(files[0], guard) == expected and pin(cipher, guard) == expected)
    return {'cipher': files[0], 'artifactId': artifact_id, **expected,
            'retentionDays': 1, 'remoteReadbackObserved': True,
            'acceptedAsCompleteBackup': False}
