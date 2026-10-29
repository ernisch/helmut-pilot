"""New same-job glue checks with fictional files and mocked Docker/native steps."""
import sys
sys.dont_write_bytecode = True

import copy
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

HERE = Path(__file__).absolute().parent
SPEC = importlib.util.spec_from_file_location('w15_restore_connection_checks', HERE / 'restore_connection.py')
R = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(R)
COMMIT = 'a' * 40
CID = 'd' * 64


class Resources:
    def __init__(self, context):
        self.context = context
        self.unit = 'w15_123456789_26d5a4135ca7415ca41262fc45b561c8.slice'
        self.path = Path('/FICTIONAL/cgroup')
        self.samples = 0
        self.pids = []

    def check_context(self, context):
        if context != self.context:
            raise ValueError('FICTIONAL_CONTEXT_CHANGED')
        self.sample()

    def sample(self):
        self.samples += 1
        return {'FICTIONAL': True}

    def check_pid(self, pid, container):
        self.pids.append((pid, container))


class SameJobConnectionChecks(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory(prefix='w15-fictional-connection-')
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.run = self.root / 'run'
        self.events = []
        self.context = {'exactCommit': COMMIT, 'runId': '123456789', 'runAttempt': 1,
                        'nonce': '26d5a413-5ca7-415c-a412-62fc45b561c8', 'runnerTemp': str(self.root),
                        'hostPaths': {'runRoot': str(self.run)}}
        self.resources = Resources(self.context)
        self.inputs = SimpleNamespace(controller_context=lambda: copy.deepcopy(self.context))
        self.forward = SimpleNamespace(ROOT=self.root, WORK=self.run / 'work', CACHE=self.run / 'cache',
                                       PREP=self.run / 'prepare', main=Mock(side_effect=AssertionError('FULLMAIN_FORBIDDEN')))
        self.receipt = {'exactCommit': COMMIT, 'runId': '123456789', 'runAttempt': 1,
                        'verifiedFiles': 12, 'verifiedBytes': 242570240, 'relocationVerified': True}
        self.received = self.root / 'PRIVATE-RECEIVER' / 'received'
        def before_root(name):
            def check(*args, **kwargs):
                self.assertFalse(self.run.exists())
                self.events.append(name)
            return check
        self.runtime = SimpleNamespace(validate_source_review=Mock(side_effect=before_root('review')),
                         C=SimpleNamespace(apply_context=Mock(side_effect=before_root('apply'))))
        def receive(*args):
            before_root('receive')()
            return self.received, self.receipt
        self.receive = Mock(side_effect=receive)
        def open_inputs(*args, **kwargs):
            before_root('open')()
            self.assertEqual(args[0], str(self.received))
            return self.inputs
        self.forward.open_runtime_inputs = Mock(side_effect=open_inputs)
        self.forward._checked_runtime_inputs = Mock(side_effect=lambda value: value)
        self.forward._checked_common_resources = Mock(side_effect=lambda value, resources: resources)
        def cache(*args, **kwargs):
            before_root('cache')()
            self.run.mkdir(mode=0o700)
            self.forward.CACHE.mkdir(mode=0o700)
            return {'status': 'FICTIONAL_CACHE_ONLY'}
        self.cache = SimpleNamespace(stage_cache=Mock(side_effect=cache))
        def prepare(*args):
            self.assertTrue(self.run.exists())
            self.events.append('prepare')
            self.forward.PREP.mkdir(mode=0o700)
        self.forward.prepare = Mock(side_effect=prepare)
        self.modules = {'runtime_inputs': self.runtime, 'runtime_cache': self.cache,
                        'common_resources': SimpleNamespace(CommonResources=Resources)}
        self.forward._runtime_module = lambda name: self.modules[name]
        self.env = {'GITHUB_ACTIONS': 'true', 'GITHUB_REF': R.E.V.BRANCH, 'GITHUB_SHA': COMMIT,
                    'GITHUB_RUN_ID': '123456789', 'GITHUB_RUN_ATTEMPT': '1'}

    def connect(self):
        with patch.dict(os.environ, self.env, clear=True), patch.object(R.E, '_receive_existing_verified', self.receive):
            return R.prepare_same_job(self.forward, self.context, self.resources,
                source_review_raw=b'FICTIONAL_REVIEW', source_review_sha256='c' * 64,
                node_source=self.root / 'FICTIONAL-node', postgrest_source=self.root / 'FICTIONAL-postgrest')

    def test_single_receive_binds_before_cache_and_preserves_canonical_controller_inputs(self):
        connection = self.connect()
        self.assertEqual(self.events, ['review', 'apply', 'receive', 'open', 'cache', 'prepare'])
        self.assertEqual(self.receive.call_count, 1)
        self.assertEqual(self.forward.open_runtime_inputs.call_count, 1)
        self.assertIs(connection.controller_inputs(), self.inputs)
        safe = json.dumps(connection.safe_summary())
        self.assertNotIn('PRIVATE-RECEIVER', safe)
        self.assertNotIn(str(self.root), safe)
        self.assertFalse(connection.safe_summary()['executionAuthority'])
        self.forward.main.assert_not_called()

    def test_wrong_job_context_stops_before_reception(self):
        self.env['GITHUB_RUN_ID'] = '987654321'
        with self.assertRaises(R.RestoreConnectionError) as error:
            self.connect()
        self.assertEqual(error.exception.phase, 'binding')
        self.receive.assert_not_called()
        self.assertFalse(self.run.exists())

    def test_source_review_rejected_before_reception_or_filesystem_writes(self):
        self.runtime.validate_source_review.side_effect = ValueError('/PRIVATE/FICTIONAL_REVIEW')
        with self.assertRaises(R.RestoreConnectionError) as error:
            self.connect()
        self.assertEqual(error.exception.phase, 'binding')
        self.assertNotIn('PRIVATE', str(error.exception))
        self.receive.assert_not_called()
        self.cache.stage_cache.assert_not_called()

    def test_summary_cannot_replace_runtime_input_validation(self):
        self.forward.open_runtime_inputs.side_effect = ValueError('FICTIONAL_MANIFEST_CHANGED')
        with self.assertRaises(R.RestoreConnectionError) as error:
            self.connect()
        self.assertEqual(error.exception.phase, 'input-binding')
        self.assertEqual(self.receive.call_count, 1)
        self.cache.stage_cache.assert_not_called()
        self.forward.prepare.assert_not_called()
        self.assertFalse(self.run.exists())

    def test_receipt_commit_or_file_set_mismatch_stops_before_cache(self):
        self.receipt['verifiedFiles'] = 11
        with self.assertRaises(R.RestoreConnectionError) as error:
            self.connect()
        self.assertEqual(error.exception.phase, 'receive')
        self.forward.open_runtime_inputs.assert_not_called()
        self.cache.stage_cache.assert_not_called()

    def setup_restore(self):
        connection = self.connect()
        f = self.forward
        f.BASE = '/tmp/w15-memory-atomic-20261028d'
        f.DB = 'helmut_w15_memory_atomic_20261028d'
        f.CONTAINER = 'w15-end500-123456789-26d5a4135ca7415ca41262fc45b561c8'
        f.SEED_MOUNT = '/run/w15-end500-seed.PRIVATE.sql'
        f.BUDGET = {'postgresMaxWalMiB': 64, 'postgresWorkMemMiB': 4, 'postgresAutovacuumNaptimeSeconds': 60}
        payload = self.root / 'private-inputs'
        payload.mkdir(mode=0o700)
        paths = {}
        for key in ('currentCommand', 'localRoles', 'frozenSourceDump', 'bound', 'seed'):
            paths[key] = payload / key
            paths[key].write_bytes(('FICTIONAL-' + key).encode())
            paths[key].chmod(0o600)
        self.inputs.path = Mock(side_effect=lambda key: paths[key])
        self.inputs.source_review_bytes = lambda: b'{"FICTIONAL_REVIEW":true}'
        self.inputs.backup_input_files = Mock(return_value={str(i): paths['bound'] for i in range(12)})
        self.inputs.backup_provenance_files = Mock(return_value={str(i): paths['bound'] for i in range(len(R.E.IP.PUBLIC_PROVENANCE))})
        f.check_seed = Mock(return_value=paths['seed'])
        f._checked_prepared = Mock()
        self.running, self.created, self.stop_calls = False, False, []
        self.bad_labels, self.watch_close_failure = False, False
        mounts = [{'Destination': f.SEED_MOUNT, 'Source': str(paths['seed']), 'RW': False}]
        def inspect():
            labels = R._labels(self.context)
            if self.bad_labels:
                labels['helmut.w15.nonce'] = 'FICTIONAL-OTHER-OWNER'
            return {'Id': CID, 'Config': {'Labels': labels}, 'Image': 'sha256:' + 'e' * 64,
                    'HostConfig': {'CgroupParent': self.resources.unit, 'NetworkMode': 'none',
                                   'Memory': 2560000000, 'MemorySwap': 2560000000}, 'Mounts': mounts,
                    'State': {'Running': self.running, 'Pid': 777 if self.running else 0, 'OOMKilled': False, 'ExitCode': 0}}
        def docker(*args, **kwargs):
            if args[:2] == ('image', 'inspect'):
                return json.dumps([{'Id': 'sha256:' + 'e' * 64}]).encode()
            if args[0] == 'ps':
                return b''
            if args[0] == 'create':
                self.created = True
            if args[0] == 'start':
                self.running = True
            if args[0] == 'stop':
                self.stop_calls.append(args[-1])
                self.running = False
            if args[0] == 'inspect':
                return json.dumps([inspect()]).encode()
            return b''
        def save(name, value):
            with (f.WORK / name).open('x') as out:
                os.chmod(out.name, 0o600)
                json.dump(value, out)
        f.M = SimpleNamespace(IMAGE='sha256:' + 'e' * 64, LIMIT=2560000000, docker=Mock(side_effect=docker),
                              DOCKER=['docker', '--host=unix:///var/run/docker.sock'], ENV={'PATH': '/usr/bin:/bin'}, save=save)
        class Watch:
            def __init__(watch, path):
                self.watch = watch
                watch.failure = watch.stop_failure = None
                watch.thread = Mock()
                watch.stopped = 0
            def sample(watch):
                if self.watch_close_failure and not self.running:
                    raise ValueError('FICTIONAL_CLOSURE_SAMPLE_FAILURE')
            def stop(watch):
                watch.stopped += 1
        f.Watch = Watch
        self.materialization = SimpleNamespace(materialize=Mock(return_value=()), verify_mounts=Mock())
        self.restore = Mock(return_value={'profiles': 500, 'active': 0, 'steps': 5})
        self.owned = Mock(return_value=SimpleNamespace(run_owned=Mock(), actions=()))
        self.modules.update(runtime_materialization=self.materialization,
                            runtime_restore=SimpleNamespace(restore_owned=self.restore),
                            runtime_owned_backup=SimpleNamespace(OwnedBackupRunner=self.owned))
        return connection

    def run_restore(self, connection):
        with patch.object(R.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0)):
            return connection.restore_only()

    def test_restore_stops_at_500_zero_and_closes_only_owned_container_without_fullmain(self):
        connection = self.setup_restore()
        result = self.run_restore(connection)
        self.assertEqual((result['profiles'], result['active'], result['restoreSteps']), (500, 0, 5))
        self.assertEqual(self.stop_calls, [CID])
        self.assertEqual(self.watch.stopped, 1)
        self.assertEqual(self.restore.call_count, 1)
        self.forward.main.assert_not_called()
        self.assertEqual(self.resources.pids, [(777, CID)])
        self.assertEqual(self.owned.call_args.kwargs['scope'], 'end500-restore')
        self.assertFalse(result['end500Acceptance'])
        self.assertFalse(result['acceptedAsCompleteBackup'])
        self.assertEqual(result['backupInputBindings'], 12)
        self.assertNotIn(str(self.root), json.dumps(result))
        with self.assertRaises(ValueError):
            connection.restore_only()
        self.assertEqual(self.restore.call_count, 1)

    def test_foreign_container_identity_never_gets_stop_rights(self):
        connection = self.setup_restore()
        self.bad_labels = True
        with self.assertRaises(R.RestoreConnectionError):
            self.run_restore(connection)
        self.assertEqual(self.stop_calls, [])
        self.restore.assert_not_called()

    def test_restore_failure_keeps_first_phase_and_stops_owned_container(self):
        connection = self.setup_restore()
        self.restore.side_effect = ValueError('/FICTIONAL/PRIVATE/NATIVE_FAILURE')
        with self.assertRaises(R.RestoreConnectionError) as error:
            self.run_restore(connection)
        self.assertEqual(error.exception.phase, 'restore')
        self.assertNotIn('PRIVATE', str(error.exception))
        self.assertEqual(self.stop_calls, [CID])
        self.assertEqual(self.watch.stopped, 1)

    def test_final_sample_failure_still_stops_monitor(self):
        connection = self.setup_restore()
        self.watch_close_failure = True
        with self.assertRaises(R.RestoreConnectionError) as error:
            self.run_restore(connection)
        self.assertEqual(error.exception.phase, 'closure')
        self.assertEqual(self.watch.stopped, 1)
        self.assertEqual(self.stop_calls, [CID])


if __name__ == '__main__':
    unittest.main()
