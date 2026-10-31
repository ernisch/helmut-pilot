"""Compare an explicitly PUBLIC canary; never accept private handoff data.

Local byte availability alone does not prove protected configuration, same-thread
configuration support, permission for a key transfer, or End500 readiness.
"""
import sys
sys.dont_write_bytecode = True

import importlib.util
import json
import os
from pathlib import Path

SPEC = importlib.util.spec_from_file_location('w15_canary_prepare', Path(__file__).with_name('prepare.py'))
P = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(P)
NAME = 'HELMUT_W15_HANDOFF_CANARY'
PUBLIC_VALUE = 'HELMUT-W15-LOCAL-CANARY-20261029'


def compare(filename=None):
    if filename is None:
        matched = os.environ.get(NAME) == PUBLIC_VALUE
    else:
        path = Path(filename)
        P.require(path.is_absolute() and path.name in (NAME, NAME + '.txt'), 'CANARY_PATH_REJECTED')
        parent = P.open_root(str(path.parent))
        fd = None
        try:
            fd = os.open(path.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
            before = os.fstat(fd)
            P.private_stat(before)
            P.require(before.st_size <= 256, 'CANARY_INPUT_REJECTED')
            raw = os.read(fd, 257)
            after = os.fstat(fd)
            P.require(len(raw) <= 256 and
                      (before.st_size, before.st_mtime_ns, before.st_ctime_ns) ==
                      (after.st_size, after.st_mtime_ns, after.st_ctime_ns), 'CANARY_INPUT_REJECTED')
        finally:
            if fd is not None:
                os.close(fd)
            os.close(parent)
        matched = raw == PUBLIC_VALUE.encode('ascii')
    return {'status': 'PASS_PUBLIC_CANARY_LOCAL_BYTES_ONLY' if matched else 'BLOCKED_PUBLIC_CANARY_NOT_LOCAL',
            'publicCanaryMatched': matched, 'protectedConfigurationVerified': False,
            'sameThreadConfigurationApplyVerified': False, 'privateHandoffAuthorized': False,
            'privateKeyRequested': False, 'passphraseRequested': False, 'readiness': 'BLOCKED',
            'executionAuthority': False, 'testStarted': False}


def main(argv=None):
    try:
        parser = P.Parser(description=__doc__, allow_abbrev=False, add_help=False)
        parser.add_argument('--check-public-canary-only', action='store_true', required=True)
        parser.add_argument('--canary-file')
        args = parser.parse_args(argv)
        result = compare(args.canary_file)
        code = 0 if result['publicCanaryMatched'] else 1
    except (Exception, KeyboardInterrupt):
        result = {'status': 'BLOCKED_CANARY_INPUT_UNAVAILABLE', 'publicCanaryMatched': False,
                  'protectedConfigurationVerified': False, 'privateHandoffAuthorized': False,
                  'privateKeyRequested': False, 'passphraseRequested': False, 'readiness': 'BLOCKED',
                  'executionAuthority': False, 'testStarted': False}
        code = 1
    print(json.dumps(result, separators=(',', ':')))
    return code


if __name__ == '__main__':
    raise SystemExit(main())
