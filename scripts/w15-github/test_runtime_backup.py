"""Fictional owned-runner/filesystem checks; no Docker, DB, GPG or network."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import Mock, patch

SPEC = importlib.util.spec_from_file_location('w15_runtime_backup_tests', Path(__file__).with_name('runtime_backup.py'))
R = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(R)


class RuntimeBackupChecks(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory(prefix='w15-fictional-runtime-backup-')
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        self.work, self.prepared = self.root / 'work', self.root / 'prepared'
        self.work.mkdir(mode=0o700)
        self.prepared.mkdir(mode=0o700)
        (self.work / 'state').mkdir(mode=0o700)
        (self.work / 'pgdata').mkdir(mode=0o700)
        self.put(self.work / 'pgdata' / 'not-a-logical-backup.key', b'FICTIONAL-NOT-TO-BE-COLLECTED')
        self.context = {'schema': 'helmut-w15-backup-context/1', 'scope': 'ISOLATED_GITHUB_END500_BACKUP_ONLY',
                        'nonce': '11111111-2222-4333-8444-555555555555', 'exactCommit': 'a' * 40,
                        'runId': '123456789', 'runAttempt': 1, 'inputManifestSHA': 'b' * 64,
                        'recipientFingerprint': 'C' * 40, 'executionAuthority': False}
        self.container = 'w15-end500-123456789-11111111222243338444555555555555'
        self.supervisor = Mock()
        self.supervisor.finished.is_set.return_value = False
        self.supervisor.thread.is_alive.return_value = True
        self.supervisor.disk_phase = 'processing'
        self.supervisor.last = {'configuredLimit': '2560000000', 'swapMaximum': '0', 'swapCurrentBytes': 0,
                                'kernelLifetimePeakBytes': 1900000000, 'currentBytes': 1800000000,
                                'events': {k: 0 for k in ('max', 'oom', 'oom_kill', 'oom_group_kill')}}
        self.closure = {'status': 'PASS_GENUINE_OWNED_SERVICE_EXIT',
                        'signalRequest': {'signal': 'SIGTERM', 'accepted': True},
                        'servicesStopped': {'confirmed': True, 'forced': False, 'openSockets': 0,
                                            'agentSockets': 0, 'agentFreeSockets': 0},
                        'durableDrain': {'confirmed': True, 'journal': {'closed': True,
                                         'status': 'DURABLE_ACKNOWLEDGED', 'pendingEntries': 0}}}
        self.put_json(self.work / 'SERVICE_CLOSURE.SAFE.json', self.closure)
        for name in ('NATIVE_ZERO.SAFE.json', 'NATIVE_ZERO_AFTER_AUDIT.SAFE.json'):
            self.put_json(self.work / name, {'activeProfiles': 0, 'confirmed': True})
        raw = b'FICTIONAL-AUDIT-ARCHIVE-NOT-GZIP'
        self.put(self.work / 'FINAL_NATIVE_AUDIT.PRIVATE.jsonl.gz', raw)
        self.put_json(self.work / 'FINAL_NATIVE_AUDIT.SAFE.json', {
            'status': 'PASS_COMPLETE_LOSSLESS_NATIVE_POSTIMAGES_AND_ZERO_ONLY', 'captureComplete': True,
            'actualPopenReturncode': 0, 'gzipPin': self.pin(raw)})
        self.observed = {'database': R.B.DATABASE, 'profiles': 500, 'activeProfiles': 0,
                         'otherClientBackends': 0, 'rolesDigest': 'd' * 32, 'readOnly': 'on',
                         'foreignTables': 0, 'tableInventory': [{'schema': 'public', 'table': 'mandate_profiles',
                            'columns': [{'name': 'id', 'type': 'integer', 'notNull': True,
                                'default': None, 'identity': '', 'generated': ''}],
                            'rows': 500, 'sha256': 'e' * 64}], 'sequenceInventory': []}
        self.calls = []

    @staticmethod
    def pin(raw):
        return {'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}

    @staticmethod
    def put(path, raw):
        path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'wb') as stream:
            stream.write(raw)

    def put_json(self, path, value):
        self.put(path, json.dumps(value).encode())

    def run_owned(self, argv, action, seconds):
        self.calls.append((argv, action, seconds))
        output = self.work / 'state/final-backup'
        raw = (json.dumps(self.observed).encode() if action in ('backup-before', 'backup-after')
               else b'PGDMP-FICTIONAL-DUMP' if action == 'backup-dump' else b'-- FICTIONAL ROLE SQL\n')
        self.put(output / R.OUTPUTS[action], raw)
        self.put(output / (action + '.PRIVATE.stderr'), b'')
        identity = {'phase': action, 'pid': 1234, 'startTicks': '123456'}
        self.put_json(self.work / ('state/' + action + '.node.SAFE.json'), identity)
        lifecycle = [
            {'sequence': 0, 'action': action, 'event': 'owned-handler-ready', 'identity': identity},
            {'sequence': 1, 'action': action, 'event': 'owned-child-spawned', 'pid': 1235},
            {'sequence': 2, 'action': action, 'event': 'owned-child-exit', 'code': 0, 'signal': None},
            {'sequence': 3, 'action': action, 'event': 'owned-backup-closed', 'dataFilesOpen': 0, 'termReceived': False},
        ]
        journal = b''.join(json.dumps(row).encode() + b'\n' for row in lifecycle)
        self.put(output / (action + '.lifecycle.PRIVATE.jsonl'), journal)
        self.put_json(output / (action + '.SAFE.json'), {
            'status': 'PASS_OWNED_DATABASE_EXPORT_STEP', 'action': action, 'returncode': 0,
            'signal': None, 'output': self.pin(raw), 'stderr': self.pin(b''),
            'identity': identity, 'lifecycle': self.pin(journal)})
        return subprocess.CompletedProcess(argv, 0)

    def export(self, runner=None, **kwargs):
        return R.export_final_database(kwargs.get('context', self.context), expected_context=self.context,
                 work=self.work, container=self.container, database=R.B.DATABASE,
                 supervisor=self.supervisor, run_owned=runner or self.run_owned)

    def test_four_owned_steps_preserve_live_monitor_and_do_not_accept_backup(self):
        result = self.export()
        self.assertEqual([x[1] for x in self.calls], list(R.ACTIONS))
        self.assertTrue(all(x[0][:3] == ['docker', '--host=unix:///var/run/docker.sock', 'exec'] for x in self.calls))
        self.assertTrue(all('set -C' in x[0][-1] and '/state/backup-' in x[0][-1] for x in self.calls))
        self.assertGreaterEqual(self.supervisor.sample.call_count, 10)
        self.assertFalse(result['acceptedAsCompleteBackup'])
        self.assertFalse(result['databaseRestoreObserved'])
        self.assertFalse(result['remoteReadbackObserved'])
        self.supervisor.stop.assert_not_called()

    def test_stopped_monitor_or_overbudget_refuses_before_first_process(self):
        self.supervisor.thread.is_alive.return_value = False
        with self.assertRaises(R.BackupRuntimeError):
            self.export()
        self.assertEqual(self.calls, [])
        self.assertFalse((self.work / 'state/final-backup').exists())

    def test_2048000001_peak_refuses_before_first_process(self):
        self.supervisor.last['kernelLifetimePeakBytes'] = 2048000001
        with self.assertRaises(R.BackupRuntimeError):
            self.export()
        self.assertEqual(self.calls, [])

    def test_no_complete_closure_no_export(self):
        (self.work / 'SERVICE_CLOSURE.SAFE.json').write_text(json.dumps({**self.closure, 'status': 'FAIL_OR_UNKNOWN'}))
        with self.assertRaises(R.BackupRuntimeError):
            self.export()
        self.assertEqual(self.calls, [])

    def test_wrong_context_cannot_start(self):
        with self.assertRaises(R.BackupRuntimeError):
            self.export(context={**self.context, 'runAttempt': 2})
        self.assertEqual(self.calls, [])

    def test_failed_runner_keeps_partial_outputs_and_never_retries(self):
        def failed(argv, action, seconds):
            if action == 'backup-dump':
                self.put(self.work / 'state/final-backup/final.PRIVATE.dump', b'PARTIAL-FICTIONAL')
                raise RuntimeError('untrusted child secret must not escape')
            return self.run_owned(argv, action, seconds)
        with self.assertRaisesRegex(R.BackupRuntimeError, '^DATABASE_EXPORT_FAILED_OR_UNKNOWN_PARTIALS_PRESERVED$'):
            self.export(failed)
        self.assertEqual(len(self.calls), 1)
        self.assertTrue((self.work / 'state/final-backup/final.PRIVATE.dump').exists())
        self.assertFalse((self.work / 'state/final-backup/SNAPSHOT_CLOSURE.PRIVATE.json').exists())

    def test_second_export_never_reuses_existing_directory(self):
        self.export()
        calls = len(self.calls)
        with self.assertRaises(R.BackupRuntimeError):
            self.export()
        self.assertEqual(len(self.calls), calls)

    def test_physical_output_hash_mismatch_rejects(self):
        def mismatch(argv, action, seconds):
            result = self.run_owned(argv, action, seconds)
            if action == 'backup-dump':
                (self.work / 'state/final-backup/final.PRIVATE.dump').write_bytes(b'BROKEN')
            return result
        with self.assertRaises(R.BackupRuntimeError):
            self.export(mismatch)
        self.assertFalse((self.work / 'state/final-backup/SNAPSHOT_CLOSURE.PRIVATE.json').exists())

    def collection(self, guard=None):
        self.export()
        for key, path in R.B.REQUIRED.items():
            if path.startswith('work/'):
                file = self.work / path[5:]
                if not file.exists():
                    self.put(file, b'FICTIONAL-' + key.encode())
        self.put(self.prepared / 'PREPARED.SAFE.json', b'FICTIONAL-PREPARED')
        self.put(self.prepared / 'app/public.js', b'// FICTIONAL PUBLIC SOURCE')
        (self.prepared / 'app/public.js').chmod(0o644)
        inputs, pins = {}, {}
        for i in range(12):
            raw = ('FICTIONAL-INPUT-' + str(i)).encode()
            file = self.root / 'source-inputs' / str(i)
            self.put(file, raw)
            inputs[str(i)] = file
            pins['input:' + str(i)] = self.pin(raw)
        provenance = self.root / 'public-proof.json'
        self.put(provenance, b'FICTIONAL-PUBLIC-PROOF')
        with patch.object(R.B, 'input_pins', return_value=pins):
            result = R.collect_backup(self.context, expected_context=self.context, input_files=inputs,
                     work=self.work, prepared=self.prepared, provenance_files={'fixture-review.json': provenance},
                     destination=self.root / 'collected', guard=guard)
        return result

    def test_collects_all_declared_bytes_and_logical_database_never_pgdata(self):
        result = self.collection()
        self.assertEqual(result['inputFiles'], 12)
        paths = {x['path'] for x in result['manifest']['files']}
        self.assertIn('database/final.PRIVATE.dump', paths)
        self.assertIn('database/roles.PRIVATE.sql', paths)
        self.assertIn('database/SNAPSHOT_CLOSURE.PRIVATE.json', paths)
        self.assertIn('work/state/final-backup/backup-dump.PRIVATE.stderr', paths)
        self.assertFalse(any('pgdata' in path for path in paths))
        self.assertFalse(result['acceptedAsCompleteBackup'])
        raw = (self.root / 'collected/manifest.PRIVATE.json').read_bytes()
        self.assertEqual(hashlib.sha256(raw).hexdigest(), result['manifestSHA256'])

    def test_common_budget_failure_preserves_partial_collection(self):
        def guard():
            if (self.root / 'collected').exists():
                raise RuntimeError('FICTIONAL_COMMON_BUDGET_FAILURE')
        with self.assertRaises(R.BackupRuntimeError):
            self.collection(guard=guard)
        self.assertTrue((self.root / 'collected').is_dir())
        self.assertFalse((self.root / 'collected/manifest.PRIVATE.json').exists())
        self.assertEqual(len(list((self.root / 'source-inputs').iterdir())), 12)

    def test_private_recursive_directory_must_be_0700(self):
        path = self.work / 'state/not-private'
        path.mkdir(mode=0o755)
        path.chmod(0o755)
        with self.assertRaises(R.BackupRuntimeError):
            R._tree(self.work / 'state', private=True)

    def test_missing_actual_child_exit_ack_cannot_accept_boolean_receipt(self):
        def no_exit(argv, action, seconds):
            result = self.run_owned(argv, action, seconds)
            journal = self.work / ('state/final-backup/' + action + '.lifecycle.PRIVATE.jsonl')
            rows = [json.loads(x) for x in journal.read_bytes().splitlines()]
            rows = [x for x in rows if x['event'] != 'owned-child-exit']
            raw = b''.join(json.dumps(x).encode() + b'\n' for x in rows)
            journal.write_bytes(raw)
            receipt = self.work / ('state/final-backup/' + action + '.SAFE.json')
            value = json.loads(receipt.read_bytes())
            value['lifecycle'] = self.pin(raw)
            receipt.write_text(json.dumps(value))
            return result
        with self.assertRaises(R.BackupRuntimeError):
            self.export(no_exit)

    def test_nested_source_addition_during_collection_is_detected(self):
        original = R._work_rows
        calls = 0
        def drift(work, fd, guard=None):
            nonlocal calls
            calls += 1
            if calls == 2:
                self.put(self.work / 'state/late.PRIVATE.log', b'FICTIONAL-LATE')
            return original(work, fd, guard=guard)
        with patch.object(R, '_work_rows', side_effect=drift):
            with self.assertRaisesRegex(R.BackupRuntimeError, '^BACKUP_COLLECTION_FAILED_OR_UNKNOWN_PARTIALS_PRESERVED$'):
                self.collection()
        self.assertFalse((self.root / 'collected/manifest.PRIVATE.json').exists())


if __name__ == '__main__':
    unittest.main()
