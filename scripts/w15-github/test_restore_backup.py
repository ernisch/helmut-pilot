"""Synthetic new backup seams; fake GPG/native children, no keys or network."""
import sys
sys.dont_write_bytecode = True

import hashlib
import importlib.util
from importlib.machinery import ModuleSpec
import io
import json
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

HERE = Path(__file__).parent


def load(name):
    spec = importlib.util.spec_from_file_location('w15_new_backup_test_' + name, HERE / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


R, RF, BF = load('restore_backup'), load('test_runtime_restore'), load('test_runtime_backup')


def pin(raw):
    return {'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}


class BackupChecks(unittest.TestCase):
    def setUp(self):
        root = tempfile.TemporaryDirectory(prefix='w15-new-backup-fictional-')
        self.addCleanup(root.cleanup)
        self.root = Path(root.name)
        self.context = {'schema': 'helmut-w15-backup-context/1', 'scope': 'ISOLATED_GITHUB_END500_BACKUP_ONLY',
            'nonce': '11111111-2222-4333-8444-555555555555', 'exactCommit': 'a' * 40,
            'runId': '123456789', 'runAttempt': 1, 'inputManifestSHA': 'b' * 64,
            'recipientFingerprint': R.FINGERPRINT, 'executionAuthority': False}
        self.payload = b'FICTIONAL PRIVATE DATA; NEVER CONSOLE OUTPUT'
        self.manifest = {'version': 1, **{k: self.context[k] for k in ('exactCommit', 'runId',
            'runAttempt', 'inputManifestSHA', 'recipientFingerprint')},
            'files': [{'path': 'database/final.PRIVATE.dump', **pin(self.payload)}]}
        self.raw = (json.dumps(self.manifest, sort_keys=True, separators=(',', ':')) + '\n').encode()
        self.manifest_sha = hashlib.sha256(self.raw).hexdigest()
        self.cipher = self.root / 'fictional.gpg'
        self.put(self.cipher, b'FICTIONAL CIPHER; NOT OPENPGP')
        self.home = self.root / 'gnupg'
        self.home.mkdir(mode=0o700)
        self.passphrase = self.root / 'passphrase.PRIVATE'
        self.put(self.passphrase, b'FICTIONAL; NOT A REAL PASSPHRASE')
        self.guard = Mock(return_value={'status': 'FICTIONAL_RESOURCE_SAMPLE'})

    @staticmethod
    def put(path, raw):
        # pathlib's parents=True gives intermediate parents the process umask
        # defaults, ignoring mode=0700. Create each new fictional parent with
        # the same private mode required by the production readback checks.
        missing, parent = [], path.parent
        while not parent.exists():
            missing.append(parent)
            parent = parent.parent
        for parent in reversed(missing):
            parent.mkdir(mode=0o700)
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'wb') as stream:
            stream.write(raw)

    def archive(self, *, extra=False, payload=None, member_type=None):
        data = io.BytesIO()
        with tarfile.open(fileobj=data, mode='w', format=tarfile.USTAR_FORMAT) as archive:
            for name, raw in [('W15_MANIFEST.PRIVATE.json', self.raw),
                              ('files/database/final.PRIVATE.dump', self.payload if payload is None else payload)]:
                member = tarfile.TarInfo(name)
                member.size = len(raw)
                if member_type is not None and name.startswith('files/'):
                    member.type = member_type
                    member.linkname = '/etc/passwd'
                archive.addfile(member, io.BytesIO(raw))
            if extra:
                member = tarfile.TarInfo('EXTRA')
                archive.addfile(member)
        return data.getvalue()

    def readback(self, *, archive=None, exit_code=0, agent_code=0, **overrides):
        data = self.archive() if archive is None else archive
        class Child:
            def __init__(self, *args, **kwargs):
                self.stdout = io.BytesIO(data)
                self.returncode = exit_code
            def wait(self, timeout=None):
                return self.returncode
            def poll(self):
                return self.returncode
            def kill(self):
                self.returncode = -9
        def run(argv, **kwargs):
            listed = b'pub:u:::::::::\nfpr:::::::::' + R.FINGERPRINT.encode() + b':\n'
            return subprocess.CompletedProcess(argv, agent_code if argv[0].endswith('gpgconf') else 0,
                                               stdout=listed)
        args = dict(cipher_bytes=self.cipher.stat().st_size,
            cipher_sha256=hashlib.sha256(self.cipher.read_bytes()).hexdigest(),
            expected_manifest=self.manifest, expected_manifest_sha256=self.manifest_sha,
            context=self.context, destination=str(self.root / 'readback'), private_home=str(self.home),
            passphrase_file=str(self.passphrase), guard=self.guard)
        args.update(overrides)
        with patch.object(R.subprocess, 'Popen', Child), patch.object(R.subprocess, 'run', side_effect=run):
            return R.authenticated_readback(str(self.cipher), **args)

    def restore_fixture(self):
        fixture = RF.RestoreChecks('runTest')
        fixture.setUp()
        self.addCleanup(fixture.doCleanups)
        fixture.controller.save.side_effect = lambda name, value: fixture.write(
            fixture.work, name, json.dumps(value).encode())
        fixture.restore()
        return fixture

    def inventory(self):
        return {'foreignTables': 0, 'sequenceInventory': [], 'tableInventory': [
            {'schema': 'public', 'table': 'mandate_profiles', 'rows': 500,
             'sha256': hashlib.sha256(b'FICTIONAL ROWS').hexdigest(), 'columns': [
                 {'name': 'aktiv', 'type': 'boolean', 'notNull': True, 'default': 'false',
                  'identity': '', 'generated': ''}]}]}

    def test_restore_five_receipts_are_rechecked_but_do_not_satisfy_full_end500_gate(self):
        fixture = self.restore_fixture()
        fd = R.S._directory(str(fixture.work), private=True)
        try:
            observed = R._restore_closure(fd)
            self.assertEqual(observed['profiles'], 500)
            with self.assertRaises(Exception):
                R.R._closure(fd)
            (fixture.state / 'restore/restore-apply.PRIVATE.stderr').write_bytes(b'FICTIONAL DRIFT')
            with self.assertRaises(Exception):
                R._restore_closure(fd)
        finally:
            os.close(fd)

    def test_restore_export_reuses_existing_four_owned_native_actions(self):
        restored = self.restore_fixture()
        exporter = BF.RuntimeBackupChecks('runTest')
        exporter.setUp()
        self.addCleanup(exporter.doCleanups)
        exporter.work = restored.work
        exporter.observed.update(self.inventory())
        context = {**exporter.context, 'recipientFingerprint': R.FINGERPRINT}
        result = R.export_restore_database(context, expected_context=context,
            work=restored.work, container=exporter.container, database=R.B.DATABASE,
            supervisor=exporter.supervisor, run_owned=exporter.run_owned)
        self.assertEqual([row[1] for row in exporter.calls], list(R.ACTIONS))
        self.assertFalse(result['acceptedAsCompleteBackup'])
        self.assertFalse(result['remoteReadbackObserved'])
        self.assertTrue(result['originalCommonLifetimeMonitorStillLive'])

    def test_complete_inventory_detects_changed_rows_duplicates_column_or_sequence(self):
        original = {**self.inventory(), 'profiles': 500, 'activeProfiles': 0}
        expected = R._inventory(original)
        changed = json.loads(json.dumps(original))
        changed['tableInventory'][0]['sha256'] = hashlib.sha256(b'FICTIONAL CHANGED ROW').hexdigest()
        self.assertNotEqual(R._inventory(changed), expected)
        changed = json.loads(json.dumps(original))
        changed['tableInventory'][0]['columns'][0]['type'] = 'text'
        self.assertNotEqual(R._inventory(changed), expected)
        changed = json.loads(json.dumps(original))
        changed['tableInventory'].append(changed['tableInventory'][0])
        with self.assertRaises(R.BackupRuntimeError):
            R._inventory(changed)
        with self.assertRaises(R.BackupRuntimeError):
            R._inventory({**original, 'foreignTables': 1})
        changed = json.loads(json.dumps(original))
        changed['sequenceInventory'].append({'schema': 'public', 'sequence': 'fixture', 'lastValue': '42', 'isCalled': 'true'})
        self.assertNotEqual(R._inventory(changed), expected)

    def test_frozen_restore_collection_keeps_all_inputs_state_provenance_and_final_exports(self):
        restored = self.restore_fixture()
        exporter = BF.RuntimeBackupChecks('runTest')
        exporter.setUp()
        self.addCleanup(exporter.doCleanups)
        exporter.work = restored.work
        exporter.observed.update(self.inventory())
        context = {**exporter.context, 'recipientFingerprint': R.FINGERPRINT}
        R.export_restore_database(context, expected_context=context,
            work=restored.work, container=exporter.container, database=R.B.DATABASE,
            supervisor=exporter.supervisor, run_owned=exporter.run_owned)
        (restored.work / 'pgdata').mkdir(mode=0o700)
        self.put(restored.work / 'pgdata/live-not-logical.key', b'FICTIONAL PHYSICAL DATA')
        prepared = self.root / 'prepared'
        prepared.mkdir(mode=0o700)
        self.put(prepared / 'prepared.PRIVATE', b'FICTIONAL PREPARE INPUT')
        inputs, pins = {}, {}
        for key in sorted(R.B.input_pins()):
            raw = ('FICTIONAL ' + key).encode()
            path = self.root / 'inputs' / (key[6:] + '.PRIVATE')
            self.put(path, raw)
            inputs[key[6:]], pins[key] = path, pin(raw)
        provenance = self.root / 'SOURCE.SAFE.json'
        self.put(provenance, b'{"status":"FICTIONAL"}')
        destination = self.root / 'selection'
        with patch.object(R.B, 'input_pins', return_value=pins):
            result = R.collect_restore_backup(context, expected_context=context,
                input_files=inputs, work=restored.work, prepared=prepared,
                provenance_files={'SOURCE.SAFE.json': provenance}, destination=destination, guard=self.guard)
        selected = {row['path'] for row in result['manifest']['files']}
        self.assertTrue(result['declaredRootsCollectedAndRechecked'])
        self.assertTrue(result['physicalPGDATAExcludedInFavorOfLogicalDump'])
        self.assertTrue({'database/final.PRIVATE.dump', 'database/roles.PRIVATE.sql',
            'database/SNAPSHOT_CLOSURE.PRIVATE.json', 'work/state/restore/RESTORE_CLOSURE.PRIVATE.json',
            'provenance/SOURCE.SAFE.json', 'prepare/prepared.PRIVATE'} <= selected)
        self.assertEqual(sum(name.startswith('inputs/') for name in selected), 12)
        self.assertFalse(any('pgdata' in name for name in selected))
        self.assertFalse(result['acceptedAsCompleteBackup'])
        self.assertTrue((restored.work / 'pgdata/live-not-logical.key').exists())
        with patch.object(R.B, 'input_pins', return_value=pins):
            inputs[next(iter(inputs))].write_bytes(b'FICTIONAL CHANGED INPUT')
            with self.assertRaisesRegex(R.BackupRuntimeError, 'COLLECTION_FAILED_OR_UNKNOWN'):
                R.collect_restore_backup(context, expected_context=context,
                    input_files=inputs, work=restored.work, prepared=prepared,
                    provenance_files={'SOURCE.SAFE.json': provenance},
                    destination=self.root / 'selection-bad', guard=self.guard)

    def test_authenticated_readback_rechecks_all_bytes_and_is_not_offhost_proof(self):
        receipt = self.readback()
        self.assertTrue(receipt['localAuthenticatedReadbackObserved'])
        self.assertFalse(receipt['remoteReadbackObserved'])
        self.assertFalse(receipt['databaseRestoreObserved'])
        self.assertFalse(receipt['acceptedAsCompleteBackup'])
        received = self.root / 'readback/database/final.PRIVATE.dump'
        self.assertEqual(received.read_bytes(), self.payload)
        self.assertEqual(received.stat().st_mode & 0o777, 0o600)
        self.assertGreater(self.guard.call_count, 3)

    def test_gpg_integrity_failure_is_not_success_even_after_complete_plaintext(self):
        with self.assertRaisesRegex(R.BackupRuntimeError, '^BACKUP_READBACK_FAILED_OR_UNKNOWN_PARTIALS_PRESERVED$'):
            self.readback(exit_code=2)
        self.assertTrue((self.root / 'readback/database/final.PRIVATE.dump').exists())
        self.assertFalse((self.root / 'readback/RECEPTION.SAFE.json').exists())

    def test_agent_close_unknown_does_not_return_a_readback_pass(self):
        with self.assertRaisesRegex(R.BackupRuntimeError, 'AGENT_CLOSE_UNKNOWN'):
            self.readback(agent_code=1)

    def test_extra_member_link_or_payload_drift_are_rejected_without_fallback(self):
        samples = [self.archive(extra=True), self.archive(member_type=tarfile.SYMTYPE),
                   self.archive(payload=b'FICTIONAL BAD HASH')]
        for index, archive in enumerate(samples):
            with self.subTest(index=index), self.assertRaises(R.BackupRuntimeError):
                self.readback(archive=archive, destination=str(self.root / ('readback' + str(index))))

    def test_manifest_traversal_or_cipher_mismatch_cannot_start_gpg(self):
        with patch.object(R.subprocess, 'Popen') as child:
            with self.assertRaises(Exception):
                R._manifest(self.raw.replace(b'database/final', b'../database/final'),
                            self.manifest_sha, self.context)
            with self.assertRaises(R.BackupRuntimeError):
                self.readback(cipher_sha256='f' * 64)
            child.assert_not_called()

    def test_role_adapter_changes_only_existing_bootstrap_create_and_preserves_original(self):
        original = b'-- source\nCREATE ROLE postgres;\nALTER ROLE postgres WITH SUPERUSER;\nCREATE ROLE "fixture role";\n'
        adapted = R._roles_for_fresh_cluster(original)
        self.assertIn(b'ALTER ROLE postgres WITH SUPERUSER;', adapted)
        self.assertIn(b'CREATE ROLE "fixture role";', adapted)
        self.assertEqual(original.count(b'CREATE ROLE postgres;'), 1)
        self.assertNotIn(b'\nCREATE ROLE postgres;\n', adapted)
        with self.assertRaises(R.BackupRuntimeError):
            R._roles_for_fresh_cluster(original.replace(b'CREATE ROLE postgres;', b''))
        with self.assertRaises(R.BackupRuntimeError):
            R._roles_for_fresh_cluster(original + b'CREATE ROLE postgres;\n')

    def test_native_role_normalization_retains_all_semantic_changes(self):
        a = b'-- original\n\\restrict abc123\nCREATE ROLE postgres;\nALTER ROLE postgres WITH LOGIN;\n\\unrestrict abc123\n'
        b = a.replace(b'-- original', b'-- fresh timestamp').replace(b'abc123', b'new456')
        self.assertEqual(R._canonical_roles(a), R._canonical_roles(b))
        self.assertNotEqual(R._canonical_roles(a), R._canonical_roles(b.replace(b'WITH LOGIN', b'WITH NOLOGIN')))

    def test_completion_executes_transport_then_authenticated_bytes_then_fresh_restore_once(self):
        manifest = {'exactCommit': self.context['exactCommit'], 'runId': self.context['runId'],
            'backupRoot': str(self.root), 'rollbackRoot': str(self.root / 'rollback'),
            'binaries': {'node': {'path': str(self.root / 'node'), **pin(b'FICTIONAL NODE')}}}
        self.put(self.root / 'node', b'FICTIONAL NODE')
        collection = {'manifest': self.manifest, 'manifestSHA256': self.manifest_sha,
                      'selectedPlaintextBytes': len(self.payload)}
        sealed = {**{k: self.context[k] for k in ('exactCommit', 'runId', 'runAttempt',
            'inputManifestSHA', 'recipientFingerprint')}, 'manifestSHA256': self.manifest_sha,
            'cipherBytes': self.cipher.stat().st_size, 'cipherSHA256': pin(self.cipher.read_bytes())['sha256']}
        events = []
        returned = {'cipher': self.cipher, 'artifactId': 1, 'remoteReadbackObserved': True,
                    **{k: sealed[k] for k in ('cipherBytes', 'cipherSHA256')}}
        transport = SimpleNamespace(roundtrip=Mock(side_effect=lambda *a, **k: events.append('transport') or returned))
        inputs = SimpleNamespace(check_sources=Mock(), backup_context=lambda: self.context,
            path=lambda key: self.root / 'received/payloads/auth.PRIVATE',
            controller_context=lambda: {'runtimePins': {'node': pin(b'FICTIONAL NODE')}}, backup_input_files=lambda: {})
        old_load = R._load
        hook = R.completion_hook(manifest, {'artifactCredentials': {'FICTIONAL_PRIVATE': 'never logged'}}, self.guard)
        with patch.object(R, '_load', side_effect=lambda name: transport if name == 'artifact_transport' else old_load(name)), \
             patch.object(R, 'authenticated_readback', side_effect=lambda *a, **k: events.append('decrypt') or {'localAuthenticatedReadbackObserved': True}), \
             patch.object(R, 'restore_readback', side_effect=lambda *a, **k: events.append('restore') or {'databaseRestoreObserved': True}):
            receipt = hook(forward=object(), inputs=inputs, resources=object(),
                           collection=collection, sealed=sealed, cipher=self.cipher)
            self.assertEqual(events, ['transport', 'decrypt', 'restore'])
            self.assertTrue(receipt['remoteReadbackObserved'])
            self.assertTrue(receipt['databaseRestoreObserved'])
            self.assertFalse(receipt['acceptedAsCompleteBackup'])
            self.assertNotIn('never logged', json.dumps(receipt))
            with self.assertRaises(R.BackupRuntimeError):
                hook(forward=object(), inputs=inputs, resources=object(),
                     collection=collection, sealed=sealed, cipher=self.cipher)
        transport.roundtrip.assert_called_once()

    def test_executable_recovery_uses_fresh_netless_owned_native_steps_and_matches_all_rows(self):
        """Exercise the new orchestration; native/GPG work remains fictional."""
        for corrupt in (False, True):
            with self.subTest(changed_recovered_row=corrupt):
                root = self.root / ('native-bad' if corrupt else 'native-good')
                root.mkdir(mode=0o700)
                verified, rollback = root / 'verified', root / 'rollback'
                verified.mkdir(mode=0o700)
                rollback.mkdir(mode=0o700)
                fixture = RF.RestoreChecks('runTest')
                fixture.setUp()
                self.addCleanup(fixture.doCleanups)
                exporter = BF.RuntimeBackupChecks('runTest')
                exporter.setUp()
                self.addCleanup(exporter.doCleanups)
                exporter.observed.update(self.inventory())
                roles = b'-- NATIVE FICTIONAL EXPORT\nCREATE ROLE postgres;\nALTER ROLE postgres WITH SUPERUSER;\n'
                node = b'FICTIONAL NODE BYTES; NOT EXECUTED'
                files = {'prepare/runtime-files/node': node,
                    'prepare/runtime-files/app/scripts/fixtures/w15-owned-process-stop.js': b'FICTIONAL',
                    'database/final.PRIVATE.dump': b'PGDMP-FICTIONAL', 'database/roles.PRIVATE.sql': roles,
                    'database/SNAPSHOT_CLOSURE.PRIVATE.json': json.dumps({
                        'schema': 'helmut-w15-runtime-database-export/1', 'context': self.context,
                        'beforeSnapshot': exporter.observed, 'afterSnapshot': exporter.observed}).encode()}
                manifest = {**self.manifest, 'files': [{'path': path, **pin(raw)} for path, raw in sorted(files.items())]}
                for path, raw in files.items():
                    self.put(verified / path, raw)
                raw_manifest = (json.dumps(manifest, sort_keys=True, separators=(',', ':')) + '\n').encode()
                self.put(verified / 'manifest.PRIVATE.json', raw_manifest)
                image = 'sha256:' + 'd' * 64
                resources = SimpleNamespace(path=Path('/FICTIONAL/common.slice'), unit='FICTIONAL.slice',
                                            check_pid=Mock(), sample=Mock(side_effect=RF.sample))
                state = {'running': False, 'create': None}
                owned_id = 'e' * 64
                m = SimpleNamespace(BASE=R.T.BASE, DB=R.T.DATABASE, DOCKER=list(R.DOCKER),
                                    ENV={'PATH': '/usr/bin:/bin'})
                def docker(*args, **kwargs):
                    if args[:2] == ('image', 'inspect'):
                        return json.dumps([{'Id': image}]).encode()
                    if args[0] == 'ps':
                        return b''
                    if args[0] == 'create':
                        state['create'] = args
                        return owned_id.encode()
                    if args[0] == 'start':
                        state['running'] = True
                    if args[0] == 'stop':
                        state['running'] = False
                    if args[0] == 'inspect':
                        create = state['create']
                        labels = dict(create[i + 1].split('=', 1) for i, x in enumerate(create) if x == '--label')
                        mounts = []
                        for i, x in enumerate(create):
                            if x != '--mount':
                                continue
                            parts = create[i + 1].split(',')
                            values = dict(x.split('=', 1) for x in parts if '=' in x)
                            mounts.append({'Type': 'bind', 'Source': values['src'], 'Destination': values['dst'],
                                           'RW': 'readonly' not in parts})
                        return json.dumps([{'Id': owned_id, 'Name': '/' + m.CONTAINER, 'Image': image,
                            'Config': {'Labels': labels}, 'NetworkSettings': {'Ports': {}},
                            'HostConfig': {'NetworkMode': 'none', 'Memory': 2560000000, 'MemorySwap': 2560000000,
                                'CgroupParent': resources.unit, 'RestartPolicy': {'Name': 'no'}},
                            'State': {'Running': state['running'], 'Pid': 1234 if state['running'] else 0,
                                      'OOMKilled': False, 'ExitCode': 0}, 'Mounts': mounts}]).encode()
                    return b''
                m.docker = docker
                m.save = lambda name, value: self.put(m.WORK / name, json.dumps(value).encode())
                class Thread:
                    alive = False
                    def start(self):
                        self.alive = True
                    def is_alive(self):
                        return self.alive
                w = fixture.w
                w.thread = Thread()
                w.disk_check = Mock(return_value={'FICTIONAL': True})
                def stage(argv, action, seconds):
                    if action in R.T.ACTIONS:
                        fixture.stage(argv, action, seconds)
                    else:
                        exporter.run_owned(argv, action, seconds)
                        if action == 'backup-roles':
                            out = m.WORK / 'state/final-backup'
                            (out / R.OUTPUTS[action]).write_bytes(roles)
                            receipt = json.loads((out / (action + '.SAFE.json')).read_text())
                            receipt['output'] = pin(roles)
                            (out / (action + '.SAFE.json')).write_text(json.dumps(receipt))
                        w.last_stage_exit_code = 0
                def watch(path):
                    self.assertEqual(path, resources.path)
                    fixture.work, fixture.state, fixture.controller = m.WORK, m.WORK / 'state', m
                    exporter.work = m.WORK
                    if corrupt:
                        exporter.observed['tableInventory'][0]['sha256'] = 'f' * 64
                    return w
                def stop():
                    w.finished.set()
                    w.thread.alive = False
                w.stop = stop
                w.stage = stage
                old_spec = R.importlib.util.spec_from_file_location
                def custom_spec(name, path, *args, **kwargs):
                    if Path(path).name == 'synthetik-500-w15-memory-forward.py':
                        def populate(module):
                            module.M, module.Watch = m, watch
                        return ModuleSpec(name, SimpleNamespace(create_module=lambda spec: None, exec_module=populate))
                    return old_spec(name, path, *args, **kwargs)
                with patch.object(R.importlib.util, 'spec_from_file_location', side_effect=custom_spec), \
                     patch.object(R.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0)):
                    kwargs = dict(context=self.context,
                        controller_context={'runtimePins': {'imageId': image, 'node': pin(node)}}, resources=resources,
                        expected_manifest=manifest, expected_manifest_sha256=hashlib.sha256(raw_manifest).hexdigest(),
                        rollback_root=rollback, guard=self.guard)
                    if corrupt:
                        with self.assertRaisesRegex(R.BackupRuntimeError, 'RECOVERY_FAILED_OR_UNKNOWN'):
                            R.restore_readback(verified, **kwargs)
                    else:
                        result = R.restore_readback(verified, **kwargs)
                        self.assertTrue(result['completeTableAndSequenceInventoryMatched'])
                        self.assertTrue(result['rolesSemanticsMatched'])
                        self.assertTrue(result['ownedRecoveryContainerStopped'])
                        self.assertFalse(result['acceptedAsCompleteBackup'])
                self.assertFalse(state['running'])
                self.assertEqual([x[1] for x in fixture.calls], list(R.T.ACTIONS))
                self.assertEqual([x[1] for x in exporter.calls], list(R.ACTIONS))
                self.assertTrue(w.finished.is_set())
                self.assertEqual((verified / 'database/roles.PRIVATE.sql').read_bytes(), roles)


if __name__ == '__main__':
    unittest.main()
