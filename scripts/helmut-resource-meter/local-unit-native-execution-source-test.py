"""Synthetic private-channel/FD boundaries; no child, Docker, PG or unit."""
import datetime
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import threading
import time
import types
import unittest
from unittest import mock

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('execution_source_offline', HERE / 'local-unit-native-execution-source.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)


class ActorStat:
    def __init__(self, actual): self.actual = actual
    def __getattr__(self, key): return 1000 if key == 'st_uid' else getattr(self.actual, key)


class ActorPath(type(Path())):
    def lstat(self): return ActorStat(super().lstat())


class Worker:
    def __init__(self, out): self.OUT, self.guards = out, 0
    def guard(self, _): self.guards += 1
    def save(self, name, value):
        raw = json.dumps(value).encode(); fd = os.open(self.OUT / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'wb') as f: f.write(raw); f.flush(); os.fsync(f.fileno())
    def pin(self, path):
        p = Path(path); raw = p.read_bytes()
        return {'path': str(p), 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}


class SourceBoundaries(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='helmut-source-channel-'); self.addCleanup(self.temp.cleanup)
        self.worker = Worker(Path(self.temp.name)); self.selection = {'operationId': 'localUnitDiagnostic-' + 'a' * 32, 'commandHash': 'b' * 64}
        self.channel = m.HostChannel(self.worker, {}, self.selection)
        actual_fstat = os.fstat
        self.patches = [mock.patch.object(m, 'Path', ActorPath),
                        mock.patch.object(m.os, 'fstat', side_effect=lambda fd: ActorStat(actual_fstat(fd)))]
        for patch in self.patches: patch.start(); self.addCleanup(patch.stop)

    def host(self, mutate=lambda value: None):
        def run():
            path = self.worker.OUT / 'HOST_REQUEST_01.PRIVATE.json'; until = time.monotonic() + 2
            while not path.exists() and time.monotonic() < until: time.sleep(.001)
            # Wait for the synthetic publisher's complete fsync boundary.
            while True:
                try: request = json.loads(path.read_bytes()); break
                except json.JSONDecodeError: time.sleep(.001)
            now = datetime.datetime.now(datetime.timezone.utc)
            reply = {'schema': 'helmut-local-unit-native-host-reply/1', **{k: request[k] for k in ('seq', 'stage', 'nonce', 'selection')},
                'requestSHA256': self.worker.pin(path)['sha256'], 'issuedAtUTC': now.isoformat(timespec='milliseconds').replace('+00:00', 'Z'),
                'expiresAtUTC': (now + datetime.timedelta(seconds=3)).isoformat(timespec='milliseconds').replace('+00:00', 'Z'),
                'result': {'synthetic': True}}
            mutate(reply)
            stage = self.worker.OUT / 'reply.stage'; self.worker.save(stage.name, reply)
            stage.rename(self.worker.OUT / 'HOST_REPLY_01.PRIVATE.json')
        thread = threading.Thread(target=run); thread.start(); self.addCleanup(thread.join, 3)

    def test_complete_fresh_reply_is_bound_to_exact_request_scope_and_bytes(self):
        self.host(); self.assertEqual(self.channel.call('HOST_OBSERVE', {}, seconds=1), {'synthetic': True})
        self.assertFalse(self.channel.sealed)
        request = json.loads((self.worker.OUT / 'HOST_REQUEST_01.PRIVATE.json').read_bytes())
        self.assertEqual(set(request['selection']), {'operationId', 'commandHash'})
        self.assertEqual(request['selection'], self.selection)

    def test_foreign_nonce_scope_or_request_hash_permanently_seals(self):
        # Each subcase is a separate synthetic operation, never a retry.
        for key, value in [('nonce', 'c' * 64), ('selection', {**self.selection, 'commandHash': 'c' * 64}), ('requestSHA256', 'c' * 64)]:
            with self.subTest(key=key):
                for path in self.worker.OUT.iterdir(): path.unlink()
                self.channel = m.HostChannel(self.worker, {}, self.selection)
                self.host(lambda reply: reply.update({key: value}))
                with self.assertRaises(RuntimeError): self.channel.call('HOST_OBSERVE', {}, seconds=1)
                self.assertTrue(self.channel.sealed)
                with self.assertRaises(RuntimeError): self.channel.call('HOST_OBSERVE', {}, seconds=1)

    def test_lost_reply_and_new_controller_do_not_reuse_the_attempt(self):
        with self.assertRaises(RuntimeError): self.channel.call('HOST_OBSERVE', {}, seconds=.025)
        self.assertTrue(self.channel.sealed)
        another = m.HostChannel(self.worker, {}, self.selection)
        with self.assertRaises(FileExistsError): another.call('HOST_OBSERVE', {}, seconds=.025)
        self.assertTrue(another.sealed)

    def test_stale_reply_is_never_a_current_host_observation(self):
        self.host(lambda reply: reply.update(issuedAtUTC='2026-01-01T00:00:00.000Z', expiresAtUTC='2026-01-01T00:00:03.000Z'))
        with self.assertRaisesRegex(RuntimeError, 'host-reply-freshness'): self.channel.call('HOST_OBSERVE', {}, seconds=1)

    def test_private_reader_rejects_duplicates_nonfinite_and_file_permission_drift(self):
        p = self.worker.OUT / 'input'; p.write_bytes(b'{"a":1,"a":2}'); p.chmod(0o600)
        with self.assertRaisesRegex(RuntimeError, 'private-duplicate'): m.private_json(self.worker, p)
        p.write_bytes(b'{"a":NaN}')
        with self.assertRaises(ValueError): m.private_json(self.worker, p)
        p.write_bytes(b'{"a":1}'); p.chmod(0o644)
        with self.assertRaisesRegex(RuntimeError, 'private-file'): m.private_json(self.worker, p)

    def test_private_reader_rejects_symlink_hardlink_and_oversized_payload(self):
        p = self.worker.OUT / 'input'; p.write_bytes(b'{"a":1}'); p.chmod(0o600)
        link = self.worker.OUT / 'symlink'; link.symlink_to(p)
        with self.assertRaises(RuntimeError): m.private_json(self.worker, link)
        hard = self.worker.OUT / 'hardlink'; os.link(p, hard)
        with self.assertRaisesRegex(RuntimeError, 'private-file'): m.private_json(self.worker, p)
        hard.unlink()
        with self.assertRaisesRegex(RuntimeError, 'private-file'): m.private_json(self.worker, p, cap=1)


if __name__ == '__main__': unittest.main()
