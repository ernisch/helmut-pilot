#!/usr/bin/env python3
"""Run the unchanged CI shell script; expose only exit/hash metadata, never logs."""
import hashlib
import json
import os
from pathlib import Path
import secrets
import signal
import stat
import subprocess
import sys


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
        output = log_directory() / ('step-' + secrets.token_hex(12) + '.log')
        fd = os.open(output, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
        env = os.environ.copy()
        blocked = {'HELMUT_CI_ORIGINALS_KEY', 'GITHUB_TOKEN', 'GH_TOKEN',
                   'GITHUB_ENV', 'GITHUB_PATH', 'GITHUB_OUTPUT', 'GITHUB_STEP_SUMMARY', 'GITHUB_STATE'}
        for name in list(env):
            if name in blocked or name.startswith('ACTIONS_'):
                env.pop(name)
        with os.fdopen(fd, 'wb') as log:
            child = subprocess.Popen(['bash', '--noprofile', '--norc', '-e', '-o', 'pipefail', str(script)],
                                     env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
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
        digest = hashlib.sha256()
        with output.open('rb') as handle:
            while block := handle.read(65536): digest.update(block)
        print(json.dumps({'scope': 'PRIVATE_CI_LOG_METADATA_ONLY', 'exitCode': code,
                          'log': output.name, 'bytes': output.stat().st_size, 'sha256': digest.hexdigest()}))
        return code if 0 <= code <= 255 else 1
    except Exception:
        if child is not None and child.poll() is None:
            os.killpg(child.pid, signal.SIGKILL)
            child.wait(timeout=5)
        print('{"code":"PRIVATE_CI_LOG_REJECTED"}')
        return 1


if __name__ == '__main__':
    sys.exit(main())
