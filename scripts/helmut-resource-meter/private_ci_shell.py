#!/usr/bin/env python3
"""Keep private CI output local; explicitly public jobs retain normal output."""
from contextlib import nullcontext
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import signal
import stat
import subprocess
import sys


SUITE_METADATA_ENV = 'HELMUT_CI_PUBLIC_SUITE_METADATA'
SUITE_METADATA_MODE = 'offline-runner-v1'
SUITE_METADATA_SCHEMA = 'helmut-private-ci-suite-failures/1'
MAX_SUITE_METADATA = 1024
MAX_PUBLIC_BYTES = 256 * 1024
MAX_SCAN_BYTES = 16 * 1024 * 1024
MAX_LINE_BYTES = 512
SUITE_NAME = rb'([A-Za-z0-9][A-Za-z0-9._-]{0,159}\.js)'
RUNNER_FAILURE = re.compile(rb'FAIL  ' + SUITE_NAME + rb' \((?:0|[1-9][0-9]{0,9})ms, exit=(null|[1-9][0-9]{0,2})\)\n')


def tracked_test_basenames():
    """Only regular tests in the checked-out HEAD, never arbitrary log text."""
    root = Path(__file__).resolve().parents[2]
    result = subprocess.run(['git', '-C', str(root), 'ls-tree', '-rz', 'HEAD', '--', 'scripts'],
        env={'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8'},
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=5, check=True)
    if len(result.stdout) > 2 * 1024 * 1024:
        raise RuntimeError('PRIVATE_CI_SUITE_METADATA_REJECTED')
    names = set()
    for row in result.stdout.split(b'\0'):
        if not row:
            continue
        header, name = row.split(b'\t', 1)
        mode, kind, _ = header.split(b' ')
        match = re.fullmatch(rb'scripts/' + SUITE_NAME, name)
        if mode not in (b'100644', b'100755') or kind != b'blob' or match is None:
            continue
        basename = match[1].decode('ascii')
        if not (basename.endswith('-test.js') or basename.endswith('gesamttest.js') or basename == 'p1-security-check.js'):
            continue
        path = root / 'scripts' / basename
        if path.resolve() == path and stat.S_ISREG(path.lstat().st_mode):
            names.add(basename)
    if not names or len(names) > 4096:
        raise RuntimeError('PRIVATE_CI_SUITE_METADATA_REJECTED')
    return names


def suite_failure_metadata(path):
    names, failures, seen = tracked_test_basenames(), [], set()
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, 'rb') as handle:
        before = os.fstat(handle.fileno())
        if not stat.S_ISREG(before.st_mode) or before.st_uid != os.getuid() or before.st_nlink != 1 or stat.S_IMODE(before.st_mode) != 0o600 or before.st_size > MAX_SCAN_BYTES:
            raise RuntimeError('PRIVATE_CI_SUITE_METADATA_REJECTED')
        read_bytes = 0
        def bounded_line():
            nonlocal read_bytes
            block = handle.readline(MAX_LINE_BYTES + 1)
            read_bytes += len(block)
            if read_bytes > before.st_size:
                raise RuntimeError('PRIVATE_CI_SUITE_METADATA_REJECTED')
            return block
        lines = 0
        while line := bounded_line():
            lines += 1
            if lines > 100000:
                raise RuntimeError('PRIVATE_CI_SUITE_METADATA_REJECTED')
            if len(line) > MAX_LINE_BYTES:
                # Discard the WHOLE physical line. Never treat its tail as a
                # new runner record; CRLF/control/private/indented lines fail.
                while line and not line.endswith(b'\n'):
                    line = bounded_line()
                continue
            match = RUNNER_FAILURE.fullmatch(line)
            if match is None:
                continue
            suite = match[1].decode('ascii')
            exit_code = None if match[2] == b'null' else int(match[2])
            if suite not in names or exit_code is not None and not 1 <= exit_code <= 255:
                continue
            if suite in seen or len(failures) >= MAX_SUITE_METADATA:
                raise RuntimeError('PRIVATE_CI_SUITE_METADATA_REJECTED')
            seen.add(suite)
            failures.append({'suite': suite, 'exitCode': exit_code})
        fields = ('st_dev', 'st_ino', 'st_mode', 'st_uid', 'st_nlink', 'st_size', 'st_mtime_ns', 'st_ctime_ns')
        after, named = os.fstat(handle.fileno()), path.lstat()
        if any(getattr(before, key) != getattr(after, key) or getattr(after, key) != getattr(named, key) for key in fields):
            raise RuntimeError('PRIVATE_CI_SUITE_METADATA_REJECTED')
    output = json.dumps({'schema': SUITE_METADATA_SCHEMA, 'failures': failures}, separators=(',', ':')) + '\n'
    for failure in failures:
        code = 'null' if failure['exitCode'] is None else str(failure['exitCode'])
        output += '::error title=Offline suite failed::' + failure['suite'] + '; exit=' + code + '\n'
    if len(output.encode('ascii')) > MAX_PUBLIC_BYTES:
        raise RuntimeError('PRIVATE_CI_SUITE_METADATA_REJECTED')
    return output


def log_directory():
    root = Path(os.environ['RUNNER_TEMP'])
    if not root.is_absolute() or root.resolve() != root or not root.is_dir():
        raise RuntimeError('PRIVATE_CI_LOG_REJECTED')
    directory = root / 'helmut-ci-private-logs'
    try:
        directory.mkdir(mode=0o700)
    except FileExistsError:
        pass
    info = directory.lstat()
    if not stat.S_ISDIR(info.st_mode) or directory.is_symlink() or info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise RuntimeError('PRIVATE_CI_LOG_REJECTED')
    return directory


def main():
    child = None
    try:
        if len(sys.argv) != 2:
            raise RuntimeError('PRIVATE_CI_LOG_REJECTED')
        script = Path(sys.argv[1])
        if not script.is_absolute() or script.resolve() != script or not script.is_file() or script.stat().st_size > 512 * 1024:
            raise RuntimeError('PRIVATE_CI_LOG_REJECTED')
        mode = os.environ.get('HELMUT_CI_PRIVATE_LOGS', 'true')
        if mode not in ('true', 'false'):
            raise RuntimeError('PRIVATE_CI_LOG_REJECTED')
        suite_mode = os.environ.get(SUITE_METADATA_ENV, '')
        if suite_mode not in ('', SUITE_METADATA_MODE):
            raise RuntimeError('PRIVATE_CI_LOG_REJECTED')
        output = None
        log_context = nullcontext(None)
        if mode == 'true':
            output = log_directory() / ('step-' + secrets.token_hex(12) + '.log')
            fd = os.open(output, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
            log_context = os.fdopen(fd, 'wb')
        env = os.environ.copy()
        blocked = {'HELMUT_CI_ORIGINALS_KEY', 'HELMUT_CI_PRIVATE_LOGS', SUITE_METADATA_ENV, 'GITHUB_TOKEN', 'GH_TOKEN',
                   'GITHUB_ENV', 'GITHUB_PATH', 'GITHUB_OUTPUT', 'GITHUB_STEP_SUMMARY', 'GITHUB_STATE'}
        for name in list(env):
            if name in blocked or name.startswith('ACTIONS_'):
                env.pop(name)
        with log_context as log:
            child = subprocess.Popen(['bash', '--noprofile', '--norc', '-e', '-o', 'pipefail', str(script)],
                                     env=env, stdout=log, stderr=subprocess.STDOUT if log else None,
                                     start_new_session=True)
            def stop(signum, frame):
                if child.poll() is None:
                    os.killpg(child.pid, signum)
                    try:
                        child.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        os.killpg(child.pid, signal.SIGKILL)
                        child.wait(timeout=5)
                raise SystemExit(128 + signum)
            signal.signal(signal.SIGTERM, stop)
            signal.signal(signal.SIGINT, stop)
            code = child.wait()
        if output is not None:
            digest = hashlib.sha256()
            with output.open('rb') as handle:
                while block := handle.read(65536): digest.update(block)
            print(json.dumps({'scope': 'PRIVATE_CI_LOG_METADATA_ONLY', 'exitCode': code,
                              'log': output.name, 'bytes': output.stat().st_size, 'sha256': digest.hexdigest()}))
            if suite_mode == SUITE_METADATA_MODE:
                try:
                    print(suite_failure_metadata(output), end='')
                except Exception:
                    pass  # Metadata loss must never mask the child exit.
        return code if 0 <= code <= 255 else 1
    except Exception:
        if child is not None and child.poll() is None:
            os.killpg(child.pid, signal.SIGKILL)
            child.wait(timeout=5)
        print('{"code":"PRIVATE_CI_LOG_REJECTED"}')
        return 1


if __name__ == '__main__':
    sys.exit(main())
