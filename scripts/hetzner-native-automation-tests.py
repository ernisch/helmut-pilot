#!/usr/bin/env python3
"""Run the synthetic native-control boundary suite using only the standard library.

Run through scripts/lokal.js with: python3 -I -S -B
scripts/hetzner-native-automation-tests.py. No target, keys, database, API,
SSH or GPG process is used. The process-bound tests spawn local Python only.
"""
import hashlib
import os
from pathlib import Path
import stat
import sys
import types
import unittest

SCRIPTS = Path(__file__).resolve().parent
ROOT = SCRIPTS.parent
SOURCE_SHA256 = {
    'bootstrap': '740e7cd3218eec796abf9fe408db2db7ddeaeeade34ddc2363942d5fcf9a4f97',
    'server': 'afbccf72ad9f60ea84091567268c3b7927bcc6df9d99dac0c5da61e27e546a85',
    'client': 'f5030ce3dfc69b40eca3a8a80675f56f90a596d1a0edc18763a49e5c01024ab5',
    'installer': 'f3512b1126ece5eb744db3f991c8c2c4d0b7703350c13ded52dd0c1c894d21d3',
}
RECIPIENT_SHA256 = '8e054d8d1c7ba5428b2fa9537462689fd0863621fd2d1eed16742fa2b3a49b10'
_sources = {}
_modules = {}


def read_noatime(path):
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NOATIME | os.O_CLOEXEC)
    try:
        before = os.fstat(descriptor)
        if not stat.S_ISREG(before.st_mode):
            raise RuntimeError('TEST_SOURCE_TYPE')
        chunks, total = [], 0
        while True:
            chunk = os.read(descriptor, 65536)
            if not chunk:
                break
            total += len(chunk)
            if total > 262144:
                raise RuntimeError('TEST_SOURCE_LIMIT')
            chunks.append(chunk)
        if before != os.fstat(descriptor):
            raise RuntimeError('TEST_SOURCE_CHANGED')
        return b''.join(chunks)
    finally:
        os.close(descriptor)


def source(name):
    if name not in _sources:
        if name == 'recipient':
            server = source('server')
            if server.count(b'# Deployment module:') != 1:
                raise RuntimeError('RECIPIENT_SOURCE_BOUNDARY')
            raw = server.split(b'# Deployment module:', 1)[0].rstrip()
            expected = RECIPIENT_SHA256
        else:
            raw = read_noatime(SCRIPTS / ('hetzner-native-automation-' + name + '.py'))
            expected = SOURCE_SHA256[name]
        if hashlib.sha256(raw).hexdigest() != expected:
            raise RuntimeError('TEST_SOURCE_SHA256_' + name.upper())
        _sources[name] = raw
    return _sources[name]


def load_source(name):
    if name not in _modules:
        filename = SCRIPTS / ('hetzner-native-automation-' +
                              ('server' if name == 'recipient' else name) + '.py')
        module = types.ModuleType('native_control_under_test_' + name)
        module.__file__ = str(filename)
        exec(compile(source(name), str(filename), 'exec'), module.__dict__)
        _modules[name] = module
    return _modules[name]


def main():
    # Shared loaders and fixtures do not require adding the checkout to sys.path.
    support = types.ModuleType('helmut_native_test_support')
    for name in ('ROOT', 'SCRIPTS', 'SOURCE_SHA256', 'RECIPIENT_SHA256',
                 'read_noatime', 'source', 'load_source'):
        setattr(support, name, globals()[name])
    sys.modules[support.__name__] = support
    suite = unittest.TestSuite()
    groups = [(group, 'hetzner-native-automation-' + group + '-test.py')
              for group in ('bootstrap', 'server', 'client', 'recipient', 'installer', 'diagnostic', 'recovery', 'stage', 'stage-diagnostic', 'setup')]
    groups.append(('stage-restore', 'hetzner-native-stage-restore-test.py'))
    groups.extend((group, 'hetzner-native-' + group + '-test.py') for group in
                  ('public-checkout', 'context', 'budget-image-import', 'local-restore-recovery',
                   'setup-driver', 'setup-service', 'setup-coordinator',
                   'setup-successor-preflight', 'setup-successor',
                   'setup-successor-client', 'setup-successor-server'))
    for group, test_file in groups:
        filename = SCRIPTS / test_file
        module = types.ModuleType('native_control_tests_' + group)
        module.__file__ = str(filename)
        exec(compile(read_noatime(filename), str(filename), 'exec'), module.__dict__)
        tests = unittest.defaultTestLoader.loadTestsFromModule(module)
        print(group + ': ' + str(tests.countTestCases()) + ' synthetic tests', flush=True)
        suite.addTests(tests)
    for name, digest in SOURCE_SHA256.items():
        source(name)
        print(name + ' SHA256: ' + digest, flush=True)
    return 0 if unittest.TextTestRunner(verbosity=2).run(suite).wasSuccessful() else 1


if __name__ == '__main__':
    sys.exit(main())
