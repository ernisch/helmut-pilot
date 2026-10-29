"""Verify only the existing 7E recipient with a fixed public control message.

No archive/DCF input, key generation, transfer, database or W15 controller.
The explicit CLI reads only its two dedicated environment secrets, after the
Actions/commit/source binding. Children receive no inherited secret environment.
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
import stat
import subprocess
import uuid

SCRIPT = Path(__file__).absolute()
REPO = SCRIPT.parents[2]
SPEC = importlib.util.spec_from_file_location('w15_existing_recipient_gpg', SCRIPT.with_name('verify_archive_key.py'))
A = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(A)
P = A.P
FINGERPRINT = '7E3998A6C2CB948C69A2EE51F4267ABF26796EDC'
BRANCH = 'refs/heads/codex/w15-github-end500-preparation-20261028'
KEY_NAME = 'HELMUT_W15_RECEIVER_PROTECTED_KEY_B64'
PASS_NAME = 'HELMUT_W15_RECEIVER_PASSPHRASE'
CONTROL = b'HELMUT W15 existing 7E recipient control only 20261029\n'
ENV = {'PATH': '/usr/bin:/bin', 'LANG': 'C', 'LC_ALL': 'C'}


class ReceiverError(ValueError):
    pass


def require(value):
    if not value:
        raise ReceiverError('EXISTING_RECIPIENT_CHECK_REJECTED')


def bind_runtime(commit):
    require(isinstance(commit, str) and re.fullmatch('[a-f0-9]{40}', commit)
            and os.environ.get('GITHUB_ACTIONS') == 'true'
            and os.environ.get('GITHUB_REF') == BRANCH
            and os.environ.get('GITHUB_SHA') == commit
            and os.environ.get('GITHUB_RUN_ATTEMPT') == '1')
    run = os.environ.get('GITHUB_RUN_ID')
    require(isinstance(run, str) and re.fullmatch('[1-9][0-9]{4,19}', run))
    git = ['/usr/bin/git', '--no-optional-locks', '-c', 'core.hooksPath=/dev/null',
           '-c', 'core.fsmonitor=false', '-c', 'safe.directory=' + str(REPO), '-C', str(REPO)]
    def read(args):
        result = subprocess.run(git + args, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                stderr=subprocess.DEVNULL, env=ENV, timeout=15, close_fds=True)
        require(result.returncode == 0 and len(result.stdout) <= 65536)
        return result.stdout
    require(read(['rev-parse', 'HEAD']) == (commit + '\n').encode())
    for file in (SCRIPT, SCRIPT.with_name('verify_archive_key.py'), SCRIPT.with_name('prepare.py')):
        require(not file.is_symlink())
        relative = str(file.relative_to(REPO))
        header, name = read(['ls-tree', '-z', commit, '--', relative]).rstrip(b'\x00').split(b'\t')
        mode, kind, digest = header.split()
        require(mode in (b'100644', b'100755') and kind == b'blob' and name.decode() == relative)
        raw = file.read_bytes()
        require(hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\x00' + raw).hexdigest().encode() == digest)
    return {'exactCommit': commit, 'runId': run, 'runAttempt': 1}


def read_environment():
    # Remove both values before validating either one. They never enter child env.
    encoded = os.environ.pop(KEY_NAME, None)
    passphrase = os.environ.pop(PASS_NAME, None)
    require(isinstance(encoded, str) and 0 < len(encoded) <= 49152
            and isinstance(passphrase, str))
    key = base64.b64decode(encoded, validate=True)
    secret = passphrase.encode('utf-8')
    require(0 < len(key) <= 36864 and 0 < len(secret) <= 4096
            and not any(value in secret for value in (b'\0', b'\r', b'\n')))
    return key, secret


def private_root(runner_temp):
    require(isinstance(runner_temp, str) and runner_temp.startswith('/') and runner_temp != '/')
    fd = os.open('/', os.O_RDONLY | os.O_DIRECTORY)
    try:
        for part in P.parts(runner_temp[1:]):
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd); fd = child
        value = os.fstat(fd)
        require(value.st_uid == os.getuid() and stat.S_IMODE(value.st_mode) & 0o022 == 0)
        name = 'w15-existing-recipient-' + uuid.uuid4().hex
        os.mkdir(name, mode=0o700, dir_fd=fd)
        os.fsync(fd)
        root = Path(runner_temp) / name
        checked = P.open_root(str(root))
        os.close(checked)
        return root
    finally:
        os.close(fd)


def primary(raw, kind):
    require(isinstance(raw, bytes) and len(raw) <= 65536 and kind in ('sec', 'pub'))
    found, awaiting = [], False
    for line in raw.decode('utf-8').splitlines():
        row = line.split(':')
        if row[0] in ('sec', 'pub'):
            require(row[0] == kind and len(row) > 1 and row[1] not in ('r', 'e', 'd'))
            require(not awaiting)
            awaiting = True
        elif row[0] == 'fpr' and awaiting:
            require(len(row) > 9)
            found.append(row[9]); awaiting = False
    require(not awaiting and found == [FINGERPRINT])


def safe_result(passed):
    return {'status': 'PASS_EXISTING_RECIPIENT_CONTROL_ONLY_START_BLOCKED' if passed else
                     'FAIL_OR_BLOCKED_EXISTING_RECIPIENT_CONTROL',
            'recipientFingerprint': FINGERPRINT, 'existingRecipientControlVerified': passed,
            'originalCipherDecrypted': False, 'archiveOrDatabaseRestoreAccepted': False,
            'commonLifetimeMemoryAccepted': False, 'privateHandoffAuthorized': False,
            'end500Acceptance': False, 'mock500Acceptance': False,
            'controllerStarted': False, 'executionAuthority': False, 'readiness': 'BLOCKED'}


def verify_existing_recipient(key, secret, runner_temp):
    """Testable fixed-recipient proof; no configurable fingerprint or commands."""
    require(type(key) is bytes and 0 < len(key) <= 36864 and type(secret) is bytes
            and 0 < len(secret) <= 4096 and not any(x in secret for x in (b'\0', b'\r', b'\n')))
    A.resource.setrlimit(A.resource.RLIMIT_CORE, (0, 0))
    previous = os.umask(0o077)
    root = home = None
    failure = None
    try:
        root = private_root(runner_temp)
        home = root / 'gnupg'; home.mkdir(mode=0o700)
        # Reuse the existing exclusive0600 log / clean-env / passphrase-fd helper.
        def run(action, args, **kwargs):
            return A._run(root, home, action, ['--disable-dirmngr'] + args, **kwargs)
        run('key-import', ['--import'], data=key, secret=secret)
        primary(run('secret-primary', ['--with-colons', '--fingerprint', '--list-secret-keys']), 'sec')
        primary(run('public-primary', ['--with-colons', '--fingerprint', '--list-keys']), 'pub')
        fd = A._file(root, 'control-cipher.PRIVATE.pgp')
        try:
            run('control-encrypt', ['--trust-model', 'always', '--compress-algo', 'none',
                                   '--recipient', FINGERPRINT, '--encrypt'], data=CONTROL, output=fd)
            os.fsync(fd)
        finally:
            os.close(fd)
        parent = P.open_root(str(root))
        try:
            cipher = P.inspect_file(parent, 'control-cipher.PRIVATE.pgp', retain_limit=16384)
        finally:
            os.close(parent)
        require(bool(cipher))
        fd = A._file(root, 'control-plaintext.PRIVATE.bin')
        try:
            run('control-decrypt', ['--decrypt'], data=cipher, output=fd, secret=secret)
            os.fsync(fd)
        finally:
            os.close(fd)
        parent = P.open_root(str(root))
        try:
            require(P.inspect_file(parent, 'control-plaintext.PRIVATE.bin', retain_limit=4096) == CONTROL)
        finally:
            os.close(parent)
    except BaseException:
        failure = ReceiverError('EXISTING_RECIPIENT_CONTROL_FAILED')
    finally:
        try:
            if home is not None:
                result = subprocess.run([A._binary('gpgconf'), '--homedir', str(home), '--kill', 'gpg-agent'],
                                        stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                        env=ENV, timeout=10, close_fds=True)
                require(result.returncode == 0)
        except BaseException:
            failure = failure or ReceiverError('EXISTING_RECIPIENT_AGENT_CLOSE_UNKNOWN')
        finally:
            os.umask(previous)
    result = safe_result(failure is None)
    if root is not None:
        with os.fdopen(A._file(root, 'RECIPIENT_CONTROL.SAFE.json'), 'w') as output:
            json.dump(result, output); output.write('\n'); output.flush(); os.fsync(output.fileno())
    if failure is not None:
        raise failure
    return result


def main(argv=None):
    try:
        parser = P.Parser(description=__doc__, allow_abbrev=False)
        parser.add_argument('--verify-existing-recipient-only', action='store_true', required=True)
        parser.add_argument('--runner-temp', required=True)
        parser.add_argument('--expected-commit', required=True)
        args = parser.parse_args(argv)
        require(args.runner_temp.startswith('/') and args.runner_temp != '/')
        binding = bind_runtime(args.expected_commit)
        key, secret = read_environment()
        result = {**verify_existing_recipient(key, secret, args.runner_temp), **binding}
        print(json.dumps(result, separators=(',', ':')))
        return 0
    except (Exception, KeyboardInterrupt):
        print(json.dumps(safe_result(False), separators=(',', ':')))
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
