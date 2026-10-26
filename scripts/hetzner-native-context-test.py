#!/usr/bin/env python3
"""Synthetic inert-context tests. Mounts, namespace APIs and observations mocked."""
from contextlib import ExitStack, redirect_stdout
import copy
import ctypes
import io
import json
import os
from pathlib import Path
import stat
import tempfile
import types
import unittest
from unittest.mock import Mock, patch

PATH = Path(__file__).with_name('hetzner-native-context.py')
with os.fdopen(os.open(PATH, os.O_RDONLY | os.O_NOFOLLOW | os.O_NOATIME), 'rb') as stream:
    SOURCE = stream.read()
m = types.ModuleType('synthetic_native_context')
exec(compile(SOURCE, str(PATH), 'exec'), m.__dict__)
SCOPE_PIN = m.SCOPE
READ_FILE, ANCHOR, NS_IDENTITY, DIRECTORY = m.read, m.anchor, m.namespace_identity, m.directory
PRIVATE = '1 0 8:1 / / rw - ext4 /dev/synthetic rw\n'
SLAVE = '1 0 8:1 / / rw master:1 - ext4 /dev/synthetic rw\n'
SHARED = '1 0 8:1 / / rw shared:1 - ext4 /dev/synthetic rw\n'


class ContextTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='native-context-synthetic-')
        self.base = Path(self.temp.name)
        self.addCleanup(self.temp.cleanup)
        self.control, self.context = self.base / 'control', self.base / 'context'
        self.control.mkdir(mode=0o700); self.context.mkdir(mode=0o700)
        (self.control / 'once').mkdir(mode=0o700)
        self.case_id = 'a' * 64
        self.case = self.control / ('stage-' + self.case_id)
        self.restored = self.case / 'restored'
        self.restored.mkdir(parents=True, mode=0o700)
        self.files = self.restored / 'files'
        for prefix in m.PREFIXES:
            (self.files / 'workspace' / prefix).mkdir(parents=True, mode=0o755)
        (self.files / 'opt/codex').mkdir(parents=True, mode=0o755)
        (self.files / 'usr/local/bin').mkdir(parents=True, mode=0o755)
        (self.context / 'run').mkdir(mode=0o700)
        self.socket = self.context / 'run/docker.sock'
        self.write(self.socket, b'SYNTHETIC_SOCKET_INODE_ONLY')
        self.namespace = self.base / 'synthetic-nsfs-inode'
        self.write(self.namespace, b'SYNTHETIC_NSFS_INODE_ONLY')
        self.expected = {'pid': 4242, 'start_ticks': 1234,
            'namespace': list(m.identity(self.namespace.stat())),
            'pid1_namespace': [99999, 99999], 'socket': list(m.identity(self.socket.stat())), 'private': True}
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        for name, value in [('BASE', str(self.context)), ('CONTROL', str(self.control)), ('SOCKET', str(self.socket)),
                            ('SCOPE', m.sha(b'SYNTHETIC_SCOPE_METADATA'))]:
            self.stack.enter_context(patch.object(m, name, value))
        self.write(self.restored / 'SOURCE_SCOPE.PRIVATE.json', b'SYNTHETIC_SCOPE_METADATA')
        restored = {'ok': True, 'status': 'BYTES_RESTORED_NOT_NATIVE_QUALIFIED', 'scope_sha256': m.SCOPE,
            'native_qualified': False, 'actual_file_count': 1767, 'actual_bytes': 2865680705,
            'metadata_state': 'VERIFIED', 'remaining_entries': 0, 'unverified_entries': []}
        self.restore_raw = self.write_json(self.restored / 'RESTORE_RECEIPT.PRIVATE.json', restored)
        receipt = {'schema': 'helmut-private-drive-stage-receipt-v1', 'source_sha256': m.STAGE_SOURCE,
            'case_id': self.case_id, 'scope_sha256': m.SCOPE, 'native_qualified': False,
            'capsule_sha256': '1' * 64, 'cipher_sha256': '2' * 64, 'compressed_tar_sha256': '3' * 64,
            'actual_file_count': 1767, 'actual_bytes': 2865680705,
            'restore_receipt_sha256': m.sha(self.restore_raw)}
        self.receipt_raw = self.write_json(self.case / 'STAGE_RECEIPT.PRIVATE.json', receipt)
        self.ready = {key: receipt[key] for key in ('case_id', 'scope_sha256', 'native_qualified',
            'capsule_sha256', 'cipher_sha256', 'compressed_tar_sha256', 'actual_file_count', 'actual_bytes')}
        self.ready.update(status='STAGE_READY_NOT_NATIVE_QUALIFIED', code='STAGE_COMPLETE', plan_sha256=m.PLAN,
                          receipt_sha256=m.sha(self.receipt_raw))
        self.ready_raw = self.write_json(self.control / 'STAGE_READY.SAFE.json', self.ready)
        self.real_open = os.open
        self.created_anchors, self.mount_plans, self.chowns = [], [], []
        def own_directory(path):
            self.assertTrue(Path(path).is_relative_to(self.base), 'no real host directory access')
            return self.real_open(path, m.PFLAGS)
        self.stack.enter_context(patch.object(m, 'directory', side_effect=own_directory))
        def safe_read(path, cap=65536):
            self.assertTrue(Path(path).is_relative_to(self.base), 'no original control reads')
            fd = self.real_open(path, m.RFLAGS)
            try:
                before = os.fstat(fd)
                raw = os.read(fd, cap + 1)
                self.assertLessEqual(len(raw), cap)
                self.assertEqual(os.fstat(fd), before)
                return raw
            finally:
                os.close(fd)
        self.stack.enter_context(patch.object(m, 'read', side_effect=safe_read))
        def opening(path, flags, *args, **kwargs):
            text = os.fsdecode(path)
            if text == '/proc/4242/ns/mnt':
                return self.real_open(self.namespace, os.O_RDONLY | os.O_CLOEXEC)
            self.assertFalse(text.startswith('/proc/'), 'all proc APIs must be mocked')
            return self.real_open(path, flags, *args, **kwargs)
        self.stack.enter_context(patch.object(m.os, 'open', side_effect=opening))
        self.stack.enter_context(patch.object(m, 'admin', return_value=None))
        self.stack.enter_context(patch.object(m, 'namespace_identity', side_effect=lambda fd: list(m.identity(os.fstat(fd)))))
        self.stack.enter_context(patch.object(m, 'filesystem', side_effect=lambda fd: [0xEF53, os.fstat(fd).st_dev]))
        self.stack.enter_context(patch.object(m, 'no_source_submounts', return_value=None))
        self.stack.enter_context(patch.object(m, 'reserved_uid', return_value=None))
        self.stack.enter_context(patch.object(m.os, 'fchown', side_effect=lambda fd, uid, gid: self.chowns.append((uid, gid))))
        def anchor(path, create=False):
            self.assertIn(path, m.ANCHORS)
            if create: self.created_anchors.append(path)
            return True
        self.stack.enter_context(patch.object(m, 'anchor', side_effect=anchor))
        own_missing = m.missing
        def missing(path):
            if path in m.ANCHORS: return True
            self.assertTrue(Path(path).is_relative_to(self.base), 'no real host path observations')
            return own_missing(path)
        self.stack.enter_context(patch.object(m, 'missing', side_effect=missing))
        self.stack.enter_context(patch.object(m.subprocess, 'Popen', side_effect=AssertionError('no real metadata process')))

    def write(self, path, raw):
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
        try: os.write(fd, raw)
        finally: os.close(fd)
        return raw

    def write_json(self, path, value):
        return self.write(path, (json.dumps(value, sort_keys=True) + '\n').encode('ascii'))

    def observer(self):
        return copy.deepcopy(self.expected)

    def child(self, namespace, expected, steps, refresh):
        self.mount_plans.append(list(steps))
        self.assertEqual(refresh(), expected)
        for fd, target, readonly in steps:
            self.assertGreaterEqual(fd, 0)
            self.assertTrue(stat.S_ISDIR(os.fstat(fd).st_mode) or target.endswith('/docker.sock'))
        self.expected['private'] = True
        return [{'path': target, 'device': os.fstat(fd).st_dev, 'inode': os.fstat(fd).st_ino,
            'filesystem': m.filesystem(fd), 'readonly': readonly, 'private': True,
            'socket_peer_pid': expected['pid'] if stat.S_ISSOCK(os.fstat(fd).st_mode) else None}
            for fd, target, readonly in steps]

    def prepare(self, observer=None, child=None, public=None):
        return m.prepare(m.sha(self.ready_raw), public=public, observer=observer or self.observer,
                         child_runner=child or self.child)

    def test_default_noop_before_admin_or_observations(self):
        with patch.object(m, 'prepare', side_effect=AssertionError('must not prepare')), redirect_stdout(io.StringIO()) as output:
            self.assertEqual(m.main([]), 2)
        self.assertIn('NOT_EXECUTED', output.getvalue())

    def test_fixed_scope_and_public_git_pins(self):
        self.assertEqual(SCOPE_PIN, '08fafd5ec430fff7a5dbb0d4822933f1350b1a639edde63fb82cae2ff8d862bd')
        self.assertEqual(m.COMMIT, '29b05ac0281347f8cde82b903b12f57e8cd5d8c9')
        self.assertEqual(m.TREE, 'bf8551601236d89f30745d83020544e49482785f')

    def test_valid_inert_projection_has_only_fixed_readonly_sources_and_one_owned_rw_case(self):
        result = self.prepare()
        self.assertEqual(result['status'], 'CONTEXT_PREPARED_NOT_NATIVE_QUALIFIED')
        self.assertFalse(result['nativeQualified'])
        self.assertFalse(result['nativeGOConsumed'])
        self.assertFalse(result['budgetParentCreated'])
        self.assertFalse(result['publicEnginePresent'])
        self.assertEqual(result['publicEngineState'], 'NOT_PRESENT_NOT_QUALIFIED')
        plan = self.mount_plans[0]
        self.assertEqual([(target, ro) for fd, target, ro in plan[:2]], [('/workspace', False), ('/run', False)])
        self.assertEqual([target for fd, target, ro in plan[2:6]], ['/workspace/' + name for name in m.PREFIXES])
        self.assertTrue(all(ro for fd, target, ro in plan[2:]))
        self.assertEqual([(target, ro) for fd, target, ro in plan[-3:]],
            [('/opt/codex', True), ('/usr/local/bin', True), ('/run/docker.sock', True)])
        self.assertEqual([record['path'] for record in result['canonicalProofs']], [target for fd, target, ro in plan])
        self.assertEqual(self.created_anchors, ['/workspace', '/opt/codex'])
        self.assertIn((1000, 1000), self.chowns)
        out = self.context / ('native-context-' + self.case_id)
        self.assertEqual((out / 'workspace/helmut-unit-diagnostic-native').stat().st_mode & 0o777, 0o700)
        self.assertTrue((out / 'CONTEXT_RECEIPT.SAFE.json').exists())
        self.assertFalse((out / 'CONTEXT_RECEIPT.PENDING.SAFE.json').exists())
        self.assertFalse((self.control / 'once' / (m.PLAN + '.json')).exists())

    def test_stage_ready_receipt_and_restore_hashes_are_checked_before_context_mutation(self):
        for path in (self.control / 'STAGE_READY.SAFE.json', self.case / 'STAGE_RECEIPT.PRIVATE.json',
                     self.restored / 'RESTORE_RECEIPT.PRIVATE.json'):
            with self.subTest(path=path.name):
                before = m.read(str(path), 1024**2)
                self.write(path, before + b' ')
                with self.assertRaises(m.Stop): m.stage_proof(m.sha(self.ready_raw))
                self.write(path, before)
        self.assertEqual(self.created_anchors, [])
        self.assertEqual(self.mount_plans, [])

    def test_pending_stage_or_consumed_native_go_blocks_before_mounts(self):
        for path in (self.control / 'STAGE_READY.PENDING.SAFE.json', self.control / 'once' / (m.PLAN + '.json')):
            self.write(path, b'{}')
            with self.assertRaises(m.Stop): m.stage_proof(m.sha(self.ready_raw))
            path.unlink()  # own synthetic fixtures only
        self.assertEqual(self.mount_plans, [])

    def test_daemon_same_as_pid1_is_rejected_before_attempt_or_anchors(self):
        self.expected['pid1_namespace'] = self.expected['namespace']
        with self.assertRaisesRegex(m.Stop, '^DAEMON_NAMESPACE_IS_HOST$'): self.prepare()
        self.assertFalse((self.context / 'NATIVE_CONTEXT_ATTEMPT.SAFE.json').exists())
        self.assertEqual(self.created_anchors, [])

    def test_changed_daemon_during_preflight_is_rejected_without_mounts(self):
        changed = self.observer(); changed['start_ticks'] += 1
        with self.assertRaisesRegex(m.Stop, '^DAEMON_CHANGED$'):
            self.prepare(observer=Mock(side_effect=[self.observer(), changed]))
        self.assertEqual(self.created_anchors, [])
        self.assertEqual(self.mount_plans, [])

    def test_final_preflight_drift_never_creates_attempt_or_global_anchors(self):
        changed = self.observer(); changed['start_ticks'] += 1
        with self.assertRaisesRegex(m.Stop, '^PREFLIGHT_CHANGED$'):
            self.prepare(observer=Mock(side_effect=[self.observer(), self.observer(), changed]))
        self.assertFalse((self.context / 'NATIVE_CONTEXT_ATTEMPT.SAFE.json').exists())
        self.assertEqual(self.created_anchors, [])
        self.assertEqual(self.mount_plans, [])

    def test_existing_once_ledger_never_adopts_partial_context(self):
        self.write(self.context / 'NATIVE_CONTEXT_ATTEMPT.SAFE.json', b'EXISTING')
        with self.assertRaisesRegex(m.Stop, '^CONTEXT_ALREADY_ATTEMPTED$'): self.prepare()
        self.assertEqual(self.created_anchors, [])
        self.assertEqual(self.mount_plans, [])

    def test_nonprivate_child_becomes_private_before_first_source_bind(self):
        events = []
        states = iter([SLAVE, PRIVATE, PRIVATE])
        expected = self.observer(); expected['private'] = False
        with patch.object(m.os, 'stat', return_value=types.SimpleNamespace(st_dev=expected['namespace'][0], st_ino=expected['namespace'][1])), \
                patch.object(m, 'proc', side_effect=lambda *args: next(states)), \
                patch.object(m, 'namespace_identity', return_value=expected['namespace']):
            m.child_steps(10, expected, [(11, '/synthetic-source', True)],
                lambda index, target, proofs=None: events.append(('check', index)),
                mount_call=lambda *args: events.append(('bind', args)),
                enter_call=lambda fd: events.append(('enter', fd)),
                private_call=lambda: events.append(('private', '/')),
                prove_call=lambda *args: events.append(('prove', 'canonical')) or [])
        self.assertEqual([event[0] for event in events], ['enter', 'check', 'private', 'check', 'bind', 'prove', 'check'])
        self.assertEqual(events[1], ('check', -1))

    def test_normalization_failure_or_still_shared_never_binds_sources(self):
        for failure in ('syscall', 'still-shared'):
            with self.subTest(failure=failure):
                binds = Mock()
                expected = self.observer(); expected['private'] = False
                action = Mock(side_effect=OSError(1, 'synthetic')) if failure == 'syscall' else Mock()
                with patch.object(m.os, 'stat', return_value=types.SimpleNamespace(st_dev=expected['namespace'][0], st_ino=expected['namespace'][1])), \
                        patch.object(m, 'namespace_identity', return_value=expected['namespace']), \
                        patch.object(m, 'proc', return_value=SHARED):
                    with self.assertRaises((OSError, m.Stop)):
                        m.child_steps(10, expected, [(11, '/synthetic-source', True)], Mock(),
                            mount_call=binds, enter_call=Mock(), private_call=action)
                binds.assert_not_called()

    def test_daemon_race_before_normalization_ack_never_binds_sources(self):
        expected = self.observer(); expected['private'] = False
        binds, normalize = Mock(), Mock()
        def check(index, target): raise m.Stop('DAEMON_CHANGED')
        with patch.object(m.os, 'stat', return_value=types.SimpleNamespace(st_dev=expected['namespace'][0], st_ino=expected['namespace'][1])), \
                patch.object(m, 'namespace_identity', return_value=expected['namespace']), patch.object(m, 'proc', return_value=SLAVE):
            with self.assertRaisesRegex(m.Stop, '^DAEMON_CHANGED$'):
                m.child_steps(10, expected, [(11, '/synthetic-source', True)], check,
                    mount_call=binds, enter_call=Mock(), private_call=normalize)
        normalize.assert_not_called(); binds.assert_not_called()

    def test_child_same_namespace_as_pid1_is_rejected_before_normalizing(self):
        expected = self.observer(); expected['pid1_namespace'] = expected['namespace']
        normalize, binds = Mock(), Mock()
        with patch.object(m.os, 'stat', return_value=types.SimpleNamespace(st_dev=expected['namespace'][0], st_ino=expected['namespace'][1])), \
                patch.object(m, 'namespace_identity', return_value=expected['namespace']):
            with self.assertRaisesRegex(m.Stop, '^CHILD_NAMESPACE_CHANGED$'):
                m.child_steps(10, expected, [(11, '/synthetic-source', True)], Mock(),
                    mount_call=binds, enter_call=Mock(), private_call=normalize)
        normalize.assert_not_called(); binds.assert_not_called()

    def test_private_propagation_is_strict_after_normalization(self):
        self.assertTrue(m.private_propagation(PRIVATE))
        for raw in (SHARED, SLAVE):
            self.assertFalse(m.private_propagation(raw, required=False))
            with self.assertRaisesRegex(m.Stop, '^DAEMON_PROPAGATION_NOT_PRIVATE$'): m.private_propagation(raw)

    def test_claimed_clean_empty_public_checkout_is_rejected_without_qualified_receipt_abi(self):
        public_dir = self.base / 'public-git-only'; public_dir.mkdir(mode=0o755)
        fd = self.real_open(public_dir, m.PFLAGS)
        info = os.fstat(fd)
        proof = {'commit': m.COMMIT, 'tree': m.TREE, 'clean': True, 'public_only': True,
                 'device': info.st_dev, 'inode': info.st_ino}
        try:
            with self.assertRaisesRegex(m.Stop, '^PUBLIC_CHECKOUT_NOT_QUALIFIED$'):
                self.prepare(public=(fd, proof))
            self.assertEqual(self.mount_plans, [])
            self.assertFalse((self.context / 'NATIVE_CONTEXT_ATTEMPT.SAFE.json').exists())
        finally: os.close(fd)

    def test_child_failure_keeps_private_first_error_and_blocks_reentry(self):
        def fail(*args):
            error = OSError(1, 'SYNTHETIC_PRIVATE_DETAIL')
            error.context_step = -1
            raise error
        with self.assertRaises(OSError): self.prepare(child=fail)
        path = self.context / 'NATIVE_CONTEXT_FIRST_ERROR.PRIVATE.json'
        before = m.read(str(path))
        record = m.parse(before)
        self.assertEqual(record['mountState'], 'UNKNOWN')
        self.assertEqual(record['lastAcknowledgedStep'], -1)
        self.assertNotIn(b'SYNTHETIC_PRIVATE_DETAIL', before)
        with self.assertRaisesRegex(m.Stop, '^CONTEXT_ALREADY_ATTEMPTED$'): self.prepare()
        self.assertEqual(m.read(str(path)), before)

    def test_complete_pending_receipt_with_failed_fsync_is_never_published_or_adopted(self):
        original = m.write_json
        def failed(root, name, value):
            original(root, name, value)
            if name == 'CONTEXT_RECEIPT.PENDING.SAFE.json':
                raise OSError(5, 'synthetic-candidate-fsync')
        with patch.object(m, 'write_json', side_effect=failed):
            with self.assertRaises(OSError): self.prepare()
        out = self.context / ('native-context-' + self.case_id)
        self.assertTrue((out / 'CONTEXT_RECEIPT.PENDING.SAFE.json').exists())
        self.assertFalse((out / 'CONTEXT_RECEIPT.SAFE.json').exists())
        with self.assertRaisesRegex(m.Stop, '^CONTEXT_ALREADY_ATTEMPTED$'): self.prepare()

    def test_absolute_workspace_anchor_checks_root_parent_without_host_access(self):
        fd = self.real_open(self.base, m.PFLAGS)
        try:
            with patch.object(m, 'directory', return_value=fd) as parent, patch.object(m, 'make_dir') as create:
                self.assertTrue(ANCHOR('/workspace', create=True))
            parent.assert_called_once_with('/')
            create.assert_called_once_with('/workspace')
        except BaseException:
            try: os.close(fd)
            except OSError: pass
            raise

    def test_no_actual_namespace_mount_or_metadata_process_is_called_by_synthetic_prepare(self):
        with patch.object(m, 'mount', side_effect=AssertionError('no real mount')), \
                patch.object(m, 'enter', side_effect=AssertionError('no real setns')), \
                patch.object(m, 'make_private', side_effect=AssertionError('no real propagation change')):
            self.assertEqual(self.prepare()['status'], 'CONTEXT_PREPARED_NOT_NATIVE_QUALIFIED')

    def test_child_cannot_claim_commit_without_complete_canonical_proofs(self):
        with self.assertRaisesRegex(m.Stop, '^CANONICAL_PROOF_INCOMPLETE$'):
            self.prepare(child=lambda *args: [])
        out = self.context / ('native-context-' + self.case_id)
        self.assertFalse((out / 'CONTEXT_RECEIPT.SAFE.json').exists())


class CanonicalTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='canonical-context-synthetic-')
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        for name in ('original', 'foreign'):
            (self.base / name).mkdir()
        self.source = os.open(self.base / 'original', m.PFLAGS)
        self.foreign = os.open(self.base / 'foreign', m.PFLAGS)
        self.addCleanup(os.close, self.source); self.addCleanup(os.close, self.foreign)
        self.info = os.fstat(self.source)
        self.expected = {'pid': 4242, 'socket': list(m.identity(self.info))}

    def prove(self, target=None, readonly=True, mount_readonly=True, actual_readonly=True,
              propagation='', filesystem_mismatch=False, socket_mode=False, placeholder=False, peer_pid=4242):
        target = self.source if target is None else target
        path = '/run/docker.sock' if socket_mode else '/workspace/synthetic-original'
        device = str(os.major(self.info.st_dev)) + ':' + str(os.minor(self.info.st_dev))
        raw = '1 0 ' + device + ' / ' + path + ' ' + ('ro' if mount_readonly else 'rw')
        raw += ',nosuid,nodev ' + propagation + ' - ext4 synthetic rw\n'
        target_fd = os.dup(target)
        real_fstat = os.fstat
        def stated(fd):
            info = real_fstat(fd)
            if not socket_mode: return info
            mode = stat.S_IFREG if placeholder and fd == target_fd else stat.S_IFSOCK
            return types.SimpleNamespace(st_dev=info.st_dev, st_ino=info.st_ino, st_mode=mode | 0o660)
        def fs(fd): return [0xEF53, 222 if filesystem_mismatch and fd == target_fd else 111]
        with patch.object(m, 'target_open', return_value=target_fd), patch.object(m, 'proc', return_value=raw), \
                patch.object(m.os, 'fstat', side_effect=stated), \
                patch.object(m.os, 'fstatvfs', return_value=types.SimpleNamespace(f_flag=os.ST_RDONLY if actual_readonly else 0)), \
                patch.object(m, 'filesystem', side_effect=fs), \
                patch.object(m, 'socket_facts', return_value=(peer_pid, m.identity(self.info))) as socket:
            result = m.canonical_proofs([(self.source, path, readonly)], self.expected)
        if socket_mode: socket.assert_called_once_with('/run/docker.sock')
        return result

    def test_actual_canonical_node_proves_inode_filesystem_readonly_and_private(self):
        result = self.prove()
        self.assertEqual(result[0]['inode'], self.info.st_ino)
        self.assertTrue(result[0]['readonly'])
        self.assertTrue(result[0]['private'])

    def test_wrong_canonical_inode_rejects_empty_prefix_projection(self):
        with self.assertRaisesRegex(m.Stop, '^CANONICAL_TARGET_INODE$'): self.prove(target=self.foreign)

    def test_missing_mount_readonly_or_kernel_readonly_never_proves_original(self):
        with self.assertRaisesRegex(m.Stop, '^CANONICAL_MOUNT_FLAGS$'): self.prove(mount_readonly=False)
        with self.assertRaisesRegex(m.Stop, '^CANONICAL_TARGET_FILESYSTEM$'): self.prove(actual_readonly=False)
        with self.assertRaisesRegex(m.Stop, '^CANONICAL_PROOF_MISMATCH$'): self.prove(filesystem_mismatch=True)

    def test_imported_shared_or_slave_propagation_never_proves_original(self):
        for optional in ('shared:1', 'master:1'):
            with self.subTest(optional=optional), self.assertRaisesRegex(m.Stop, '^DAEMON_PROPAGATION_NOT_PRIVATE$'):
                self.prove(propagation=optional)

    def test_canonical_socket_requires_socket_inode_and_actual_own_peer(self):
        self.assertEqual(self.prove(socket_mode=True)[0]['socket_peer_pid'], 4242)
        with self.assertRaisesRegex(m.Stop, '^CANONICAL_TARGET_INODE$'): self.prove(socket_mode=True, placeholder=True)
        with self.assertRaisesRegex(m.Stop, '^CANONICAL_SOCKET_PEER$'): self.prove(socket_mode=True, peer_pid=9999)

    def test_canonical_anchor_final_symlink_is_rejected_without_following(self):
        link = self.base / 'anchor'
        link.symlink_to(self.base / 'original', target_is_directory=True)
        parent = os.open(self.base, m.PFLAGS)
        with patch.object(m, 'directory', return_value=parent):
            with self.assertRaisesRegex(m.Stop, '^CANONICAL_TARGET_SYMLINK$'):
                m.target_open(str(link))

    def test_each_new_bind_is_explicitly_private_before_readonly_remount(self):
        target = os.dup(self.foreign)
        info = types.SimpleNamespace(st_mode=stat.S_IFDIR | 0o755, st_uid=0, st_gid=0)
        function = Mock(return_value=0)
        with patch.object(m, 'target_open', return_value=target), patch.object(m.os, 'fstat', return_value=info), \
                patch.object(m.ctypes, 'CDLL', return_value=types.SimpleNamespace(mount=function)):
            m.mount(self.source, '/workspace/synthetic-original', True)
        flags = [call.args[3] for call in function.call_args_list]
        self.assertEqual(flags, [4096 | 16384, 16384 | 262144, 4096 | 32 | 1 | 2 | 4])

    def test_private_bind_failure_prevents_readonly_step(self):
        target = os.dup(self.foreign)
        info = types.SimpleNamespace(st_mode=stat.S_IFDIR | 0o755, st_uid=0, st_gid=0)
        function = Mock(side_effect=[0, -1])
        with patch.object(m, 'target_open', return_value=target), patch.object(m.os, 'fstat', return_value=info), \
                patch.object(m.ctypes, 'CDLL', return_value=types.SimpleNamespace(mount=function)):
            with self.assertRaises(OSError): m.mount(self.source, '/workspace/synthetic-original', True)
        self.assertEqual(function.call_count, 2)


class ObserverTests(unittest.TestCase):
    def test_root_anchor_parent_uses_held_root_fd_without_empty_component_open(self):
        with patch.object(m.os, 'open', return_value=123) as opening:
            self.assertEqual(DIRECTORY('/'), 123)
        opening.assert_called_once_with('/', m.PFLAGS)

    def observation(self, changes=None, output=None, exit_code=0):
        changes = changes or {}
        fields = {'Id': m.SERVICE, 'ActiveState': 'active', 'SubState': 'running', 'MainPID': '4242',
                  'ControlGroup': '/system.slice/' + m.SERVICE}
        fields.update(changes.get('service', {}))
        raw = output if output is not None else ''.join(k + '=' + v + '\n' for k, v in fields.items()).encode()
        chunks = iter((raw, b''))
        stream = Mock(); stream.fileno.return_value = 77
        process = Mock(stdout=stream)
        process.wait.return_value = exit_code; process.poll.return_value = 0
        class Selector:
            def __enter__(self): self.live = True; return self
            def __exit__(self, *args): return False
            def register(self, *args): pass
            def unregister(self, *args): self.live = False
            def get_map(self): return {77: True} if self.live else {}
            def select(self, timeout): return [(None, 1)]
        values = {'/proc/4242/status': 'Uid:\t0\t0\t0\t0\nGid:\t0\t0\t0\t0\n',
            '/proc/4242/comm': 'dockerd\n', '/proc/4242/cgroup': '0::/system.slice/' + m.SERVICE + '/daemon\n',
            '/proc/4242/stat': '4242 (dockerd) ' + ' '.join(['S'] + ['0'] * 18 + ['1234', '0']),
            '/proc/4242/mountinfo': SLAVE}
        values.update(changes.get('proc', {}))
        namespace = types.SimpleNamespace(st_dev=5, st_ino=6)
        host = types.SimpleNamespace(st_dev=5, st_ino=7)
        def proc(path, cap=262144):
            if path not in values: raise AssertionError('unexpected proc API')
            return values[path]
        def stated(path, *args, **kwargs):
            if path == '/proc/4242/ns/mnt': return namespace
            if path == '/proc/1/ns/mnt': return namespace if changes.get('host_namespace') else host
            raise AssertionError('unexpected host metadata')
        with patch.object(m.subprocess, 'Popen', return_value=process) as popen, \
                patch.object(m.selectors, 'DefaultSelector', Selector), \
                patch.object(m.os, 'read', side_effect=lambda *args: next(chunks)), \
                patch.object(m, 'socket_facts', return_value=(changes.get('peer_pid', 4242), (8, 9))), \
                patch.object(m, 'proc', side_effect=proc), patch.object(m.os, 'stat', side_effect=stated), \
                patch.object(m.os, 'readlink', return_value=changes.get('exe', m.BASE + '/bin/dockerd')):
            result = m.observe()
        argv = popen.call_args.args[0]
        self.assertEqual(argv, ['/usr/bin/systemctl', 'show', m.SERVICE, '--no-pager',
                               '--property=Id,ActiveState,SubState,MainPID,ControlGroup'])
        self.assertEqual(popen.call_args.kwargs['env'], {'PATH': '/usr/bin:/bin', 'LC_ALL': 'C'})
        self.assertNotIn('shell', popen.call_args.kwargs)
        return result

    def test_exact_metadata_observer_accepts_own_slave_namespace_without_mutation(self):
        result = self.observation()
        self.assertEqual(result['pid'], 4242)
        self.assertEqual(result['start_ticks'], 1234)
        self.assertFalse(result['private'])
        self.assertNotEqual(result['namespace'], result['pid1_namespace'])

    def test_service_socket_proc_and_host_namespace_mismatch_fail_closed(self):
        for changes in ({'service': {'ActiveState': 'inactive'}}, {'service': {'Id': 'docker.service'}},
                {'peer_pid': 9999}, {'proc': {'/proc/4242/status': 'Uid: 0 1000 0 0\nGid: 0 0 0 0\n'}},
                {'proc': {'/proc/4242/cgroup': '0::/system.slice/docker.service\n'}},
                {'exe': '/usr/bin/dockerd'}, {'host_namespace': True}):
            with self.subTest(changes=changes), self.assertRaises(m.Stop): self.observation(changes)

    def test_metadata_subprocess_failure_or_oversized_output_is_rejected(self):
        with self.assertRaisesRegex(m.Stop, '^SERVICE_OBSERVATION$'): self.observation(exit_code=1)
        with self.assertRaisesRegex(m.Stop, '^SERVICE_OUTPUT_LIMIT$'): self.observation(output=b'x' * 4097)

    def socket_observation(self, changes=None):
        changes = changes or {}
        info = {'ServerVersion': '28.4.0', 'Driver': 'vfs', 'CgroupDriver': 'cgroupfs',
                'CgroupVersion': '2', 'Containers': 0, 'ContainersRunning': 0}
        info.update(changes.get('info', {}))
        before = types.SimpleNamespace(st_mode=stat.S_IFSOCK | changes.get('mode', 0o660),
            st_uid=0, st_gid=changes.get('gid', 1000), st_dev=8, st_ino=9)
        peer = Mock(); peer.getsockopt.return_value = m.struct.pack('3i', 4242, 0, 0)
        responses = []
        for value in (info, changes.get('containers', [])):
            response = Mock(status=200); response.read.return_value = json.dumps(value).encode()
            connection = Mock(); connection.getresponse.return_value = response
            responses.append(connection)
        with patch.object(m.os, 'stat', return_value=before), patch.object(m.socket, 'socket', return_value=peer) as sock, \
                patch.object(m.http.client, 'HTTPConnection', side_effect=responses):
            result = m.socket_facts()
        self.assertEqual([item.request.call_args.args[:2] for item in responses],
                         [('GET', '/info'), ('GET', '/containers/json?all=1')])
        self.assertTrue(all(item.request.call_count == 1 for item in responses))
        return result

    def test_exact_docker28_vfs_cgroupv2_zero_container_socket_scope(self):
        self.assertEqual(self.socket_observation(), (4242, (8, 9)))
        for info in ({'ServerVersion': '29.0.0'}, {'Driver': 'overlay2'}, {'CgroupDriver': 'systemd'},
                     {'CgroupVersion': '1'}, {'Containers': 1}, {'Containers': False}, {'ContainersRunning': 1}):
            with self.subTest(info=info), self.assertRaisesRegex(m.Stop, '^DOCKER_SCOPE$'):
                self.socket_observation({'info': info})
        with self.assertRaisesRegex(m.Stop, '^DOCKER_SCOPE$'):
            self.socket_observation({'containers': [{'Id': 'synthetic'}]})

    def test_uid1000_socket_permission_mismatch_is_rejected_before_connect(self):
        for changes in ({'gid': 0}, {'mode': 0o666}):
            with self.subTest(changes=changes), self.assertRaisesRegex(m.Stop, '^SOCKET_UID1000_ACCESS$'):
                self.socket_observation(changes)

    def test_held_namespace_descriptor_requires_nsfs_not_an_ordinary_project_file(self):
        def fs(magic):
            def inspect(fd, buffer):
                ctypes.cast(buffer, ctypes.POINTER(ctypes.c_long))[0] = magic
                return 0
            return inspect
        info = types.SimpleNamespace(st_mode=stat.S_IFREG | 0o444, st_dev=5, st_ino=6)
        for magic in (0x6e736673, 0xEF53):
            function = Mock(side_effect=fs(magic))
            with patch.object(m.ctypes, 'CDLL', return_value=types.SimpleNamespace(fstatfs=function)), \
                    patch.object(m.os, 'fstat', return_value=info):
                if magic == 0x6e736673: self.assertEqual(NS_IDENTITY(123), [5, 6])
                else:
                    with self.assertRaisesRegex(m.Stop, '^NAMESPACE_FD_NOT_NSFS$'): NS_IDENTITY(123)

    def test_source_submounts_and_assigned_uid_or_gid_block(self):
        with patch.object(m, 'proc', return_value='1 0 8:1 / /synthetic/source/nested rw - ext4 none rw\n'):
            with self.assertRaisesRegex(m.Stop, '^SOURCE_SUBMOUNT$'):
                m.no_source_submounts(['/synthetic/source'])
        with patch.object(m.pwd, 'getpwuid', side_effect=KeyError), patch.object(m.grp, 'getgrgid', return_value=object()):
            with self.assertRaisesRegex(m.Stop, '^UID_OR_GID1000_ASSIGNED$'): m.reserved_uid()


if __name__ == '__main__':
    unittest.main(verbosity=2)
