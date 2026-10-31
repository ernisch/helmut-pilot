"""Local proof of the existing password-based recovery backup, never a transfer.

No password value is accepted as an argument. A supplied private secret file or
the single named environment secret is passed to GPG through a descriptor.
Only a fixed SAFE result reaches stdout. Existing inputs are never modified.
This proves the recovery key/control only, not the W15 recipient or a DB restore.
"""
import sys
sys.dont_write_bytecode = True

import hashlib
import importlib.util
import json
import os
from pathlib import Path
import resource
import shutil
import subprocess
import uuid

SPEC = importlib.util.spec_from_file_location('w15_archive_prepare', Path(__file__).with_name('prepare.py'))
P = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(P)
SECRET_NAME = 'HELMUT_W15_ARCHIVE_PASSPHRASE'
EXPECTED = {
    'keyCipher': {'bytes': 569, 'sha256': '1d7c25d1041fdc91da2151f28cb15ca6d7944fc66107e7c236787c2fd62b77f5'},
    'challengeCipher': {'bytes': 467, 'sha256': '09bc1f7539359551afb03a02f3ee002b9dee1c4ad8de289cab563c26ab8927af'},
    'exportSHA256': 'd671166bc1a8d387a85b07e1b63ce7aebf57d27458147321142cb3db9aa6f00d',
    'fingerprint': 'DCFD605ED28EEACA9B826105E769DE07A68BA8E4',
    'challengeSHA256': '54768587e5a7330c5f62ed9fbabefba98911fb1cbd497575e39fd1867e762928',
}


class RecoveryError(ValueError):
    pass


def require(value, code='RECOVERY_BINDING_REJECTED'):
    if not value:
        raise RecoveryError(code)


def inputs(root, expected=EXPECTED):
    fd = P.open_root(str(root))
    try:
        return tuple(P.inspect_file(fd, name, expected[key], retain_limit=8192)
                     for name, key in (('KEY_BACKUP.PRIVATE.pgp', 'keyCipher'),
                                       ('CHALLENGE.PRIVATE.pgp', 'challengeCipher')))
    finally:
        os.close(fd)


def read_secret(filename=None):
    if filename is None:
        value = os.environ.pop(SECRET_NAME, None)
        require(value is not None, 'ARCHIVE_SECRET_UNAVAILABLE')
        value = value.encode('utf-8')
    else:
        path = Path(filename)
        require(path.is_absolute(), 'ARCHIVE_SECRET_FILE_REJECTED')
        parent = P.open_root(str(path.parent))
        try:
            value = P.inspect_file(parent, path.name, retain_limit=4096)
        finally:
            os.close(parent)
    require(0 < len(value) <= 4096 and not any(c in value for c in (b'\0', b'\r', b'\n')),
            'ARCHIVE_SECRET_UNUSABLE')
    return value


def _file(root, name):
    return os.open(root / name, os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)


def _binary(name):
    require(name in ('gpg', 'gpgconf'))
    binary = shutil.which(name, path='/usr/bin:/bin')
    require(binary is not None, 'GPG_TOOLS_UNAVAILABLE')
    return binary


def _gpg(home):
    _binary('gpgconf')
    return [_binary('gpg'), '--no-options', '--homedir', str(home), '--batch', '--no-tty',
            '--no-auto-key-retrieve', '--no-auto-key-import', '--pinentry-mode', 'loopback']


def _run(root, home, action, arguments, *, data=None, output=None, secret=None):
    read_fd = write_fd = log_fd = None
    try:
        extra, inherited = [], ()
        if secret is not None:
            read_fd, write_fd = os.pipe()
            os.write(write_fd, secret + b'\n')
            os.close(write_fd); write_fd = None
            extra, inherited = ['--passphrase-fd', str(read_fd)], (read_fd,)
        log_fd = _file(root, action + '.PRIVATE.log')
        result = subprocess.run(_gpg(home) + extra + arguments, input=data,
                                stdout=output if output is not None else subprocess.PIPE,
                                stderr=log_fd, pass_fds=inherited, timeout=30,
                                env={'PATH': '/usr/bin:/bin', 'LANG': 'C', 'LC_ALL': 'C'})
        os.fsync(log_fd)
        require(result.returncode == 0, 'GPG_PROOF_FAILED')
        return result.stdout
    finally:
        for fd in (read_fd, write_fd, log_fd):
            if fd is not None:
                os.close(fd)


def _proof(key_cipher, challenge_cipher, secret, output_root, expected):
    """Internal crypto operation; CLI always enforces the immutable real pins."""
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    require(output_root.is_absolute() and not output_root.exists())
    parent = P.open_root(str(output_root.parent))
    try:
        os.mkdir(output_root.name, 0o700, dir_fd=parent)
        os.fsync(parent)
    finally:
        os.close(parent)
    home = output_root / 'gnupg'
    home.mkdir(mode=0o700)
    failure = None
    result = None
    try:
        fd = _file(output_root, 'recovered-key.PRIVATE.pgp')
        try:
            _run(output_root, home, 'key-decrypt', ['--decrypt'], data=key_cipher, output=fd, secret=secret)
            os.fsync(fd)
        finally:
            os.close(fd)
        key_path = output_root / 'recovered-key.PRIVATE.pgp'
        require(hashlib.sha256(key_path.read_bytes()).hexdigest() == expected['exportSHA256'])
        _run(output_root, home, 'key-import', ['--import', str(key_path)])
        listing = _run(output_root, home, 'key-fingerprint', ['--with-colons', '--fingerprint', '--list-secret-keys'])
        rows = [line.split(':') for line in listing.decode('utf-8').splitlines()]
        require(sum(row[0] == 'sec' for row in rows) == 1)
        fingerprints = [row[9] for row in rows if row[0] == 'fpr']
        require(fingerprints and fingerprints[0] == expected['fingerprint'])
        fd = _file(output_root, 'challenge-plaintext.PRIVATE.bin')
        try:
            _run(output_root, home, 'challenge-decrypt', ['--decrypt'], data=challenge_cipher, output=fd)
            os.fsync(fd)
        finally:
            os.close(fd)
        require(hashlib.sha256((output_root / 'challenge-plaintext.PRIVATE.bin').read_bytes()).hexdigest()
                == expected['challengeSHA256'])
        result = {'status': 'PASS_RECOVERY_KEY_AND_PINNED_CONTROL_ONLY',
                  'recoveredFingerprint': expected['fingerprint'], 'keyExportSHA256Verified': True,
                  'challengeSHA256Verified': True, 'w15RecipientRestored': False,
                  'originalCipherDecrypted': False, 'archiveOrDatabaseRestoreAccepted': False,
                  'executionAuthority': False, 'testStarted': False}
    except BaseException:
        failure = RecoveryError('KEY_OR_CONTROL_PROOF_FAILED')
    finally:
        # This freshly created home only. Never stop a pre-existing GPG agent.
        try:
            subprocess.run([_binary('gpgconf'), '--homedir', str(home),
                            '--kill', 'gpg-agent'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                           env={'PATH': '/usr/bin:/bin', 'LANG': 'C'}, timeout=10, check=True)
        except BaseException:
            failure = failure or RecoveryError('PRIVATE_GPG_AGENT_CLOSURE_UNCONFIRMED')
        safe = result if failure is None else {'status': 'FAIL_KEY_OR_CONTROL_PROOF',
                'w15RecipientRestored': False, 'executionAuthority': False, 'testStarted': False}
        fd = _file(output_root, 'KEY_RECOVERY.SAFE.json')
        with os.fdopen(fd, 'w') as stream:
            json.dump(safe, stream); stream.write('\n'); stream.flush(); os.fsync(stream.fileno())
    if failure:
        raise failure
    return result


def main(argv=None):
    try:
        parser = P.Parser(description=__doc__, allow_abbrev=False)
        mode = parser.add_mutually_exclusive_group(required=True)
        mode.add_argument('--check-inputs-only', action='store_true')
        mode.add_argument('--verify-archive-key-only', action='store_true')
        parser.add_argument('--evidence-root', required=True)
        parser.add_argument('--secret-file')
        args = parser.parse_args(argv)
        root = Path(args.evidence_root)
        key_cipher, challenge_cipher = inputs(root)
        if args.check_inputs_only:
            result = {'status': 'PASS_PINNED_PASSWORD_BASED_KEY_INPUTS_ONLY',
                      'passphraseRead': False, 'keyRecoveryVerified': False,
                      'w15RecipientRestored': False, 'executionAuthority': False}
        else:
            secret = read_secret(args.secret_file)
            result = _proof(key_cipher, challenge_cipher, secret,
                            root.parent / ('recovered-' + uuid.uuid4().hex), EXPECTED)
        print(json.dumps(result, separators=(',', ':')))
        return 0
    except (Exception, KeyboardInterrupt):
        print(json.dumps({'status': 'FAIL_OR_BLOCKED_ARCHIVE_KEY_CHECK',
                          'keyRecoveryVerified': False, 'w15RecipientRestored': False,
                          'executionAuthority': False, 'testStarted': False}, separators=(',', ':')))
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
