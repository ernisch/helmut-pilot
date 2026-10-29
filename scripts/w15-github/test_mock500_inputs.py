"""Small fictional bindings only: no original qualification, HTTP, DB or run."""
import sys
sys.dont_write_bytecode = True
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import shutil
import subprocess
from datetime import datetime, timedelta, timezone
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import Mock, patch

HERE = Path(__file__).absolute().parent
SPEC = importlib.util.spec_from_file_location('w15_mock500_inputs_tested', HERE / 'mock500_inputs.py')
M = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(M)
NONCE = '26d5a413-5ca7-415c-a412-62fc45b561c8'


def context(temp='/FICTIONAL'):
    root = temp + '/w15-mock500-123456789-' + NONCE.replace('-', '')
    return {'schema': 'helmut-w15-mock500-controller-context/1', 'scope': 'ISOLATED_GITHUB_MOCK500_BINDING_ONLY',
        'exactCommit': 'a' * 40, 'runId': '123456789', 'runAttempt': 1, 'nonce': NONCE, 'runnerTemp': temp,
        'hostPaths': {'runRoot': root, 'work': root + '/work', 'prepare': root + '/prepare', 'cache': root + '/cache'},
        'runtimePins': {}, 'inputManifestPin': {'sha256': 'b' * 64}, 'executionAuthority': False, 'testStarted': False}


def record(ctx):
    assets = {key: {'bytes': 3, 'sha256': 'c' * 64} for key in M.ASSETS}
    return {'schema': 'helmut-w15-mock500-static-input-binding/1', 'scope': 'ISOLATED_GITHUB_MOCK500_INPUTS_ONLY',
        'status': 'PASS_INDEPENDENT_MOCK500_INPUT_BINDING_ONLY', 'exactCommit': ctx['exactCommit'], 'assets': assets,
        'sourceComparison': {'status': 'PASS_INDEPENDENT_ORIGINAL16_CURRENT2_SOURCE_COMPARISON',
            'originalSourceChecks': 16, 'currentSourceChecks': 2, 'qualificationSHA256': assets['qualificationReport']['sha256'],
            'sourceDatesRewritten': False, 'originalsUnchanged': True}, 'executionAuthority': False, 'testStarted': False}


class BindingChecks(unittest.TestCase):
    def setUp(self):
        self.ctx = context()
        self.record = record(self.ctx)
        self.paths = {key: '/FICTIONAL/' + key for key in M.ASSETS | {'node', 'postgrest'}}
        self.paths['originalReception'] = '/FICTIONAL/reception'
        class RuntimeInputs:
            def __init__(self, ctx): self.ctx = ctx; self.check_sources = Mock(); self._repo = M.REPO
            def controller_context(self): return copy.deepcopy(self.ctx)
            def path(self, key): return Path('/FICTIONAL/' + key)
            def backup_input_files(self): return {'FICTIONAL': Path('/FICTIONAL')}
            def backup_provenance_files(self): return {}
        self.runtime = RuntimeInputs(self.ctx)
        self.module = SimpleNamespace(RuntimeInputs=RuntimeInputs)
        self.observed = {key: self.ctx[key] for key in ('exactCommit', 'runId', 'runAttempt', 'nonce')} | {
            'branch': 'refs/heads/codex/w15-github-end500-preparation-20261028', 'mode': 'mock500-full-gated'}

    def open(self, record=None, paths=None, observed=None):
        raw = M.canonical(self.record if record is None else record)
        return M.open_inputs(self.runtime, context=self.ctx, binding_raw=raw,
            binding_sha256=hashlib.sha256(raw).hexdigest(), asset_paths=self.paths if paths is None else paths,
            observed_context=self.observed if observed is None else observed)

    def test_static_review_and_fresh_observation_are_separate_no_future_review(self):
        with patch.dict(sys.modules, {'w15_github_runtime_inputs': self.module}), patch.object(M.Mock500Inputs, 'check_sources'):
            result = self.open()
            self.assertEqual(result.controller_context(), self.ctx)
            self.assertNotIn('contextSHA256', result._record)
            self.assertFalse(result._record['executionAuthority'])
            bad = {**self.observed, 'runId': '123456788'}
            with self.assertRaises(M.MockInputError): self.open(observed=bad)
            self.runtime.ctx = {**self.ctx, 'nonce': '46d5a413-5ca7-415c-a412-62fc45b561c8'}
            with self.assertRaises(M.MockInputError): self.open()

    def test_missing_assets_and_false_source_comparison_fail_closed(self):
        with patch.dict(sys.modules, {'w15_github_runtime_inputs': self.module}), patch.object(M.Mock500Inputs, 'check_sources'):
            missing = dict(self.paths); missing.pop('qualifiedRows')
            with self.assertRaises(M.MockInputError): self.open(paths=missing)
            for key, changed in [('originalSourceChecks', 15), ('currentSourceChecks', 1),
                ('sourceDatesRewritten', True), ('originalsUnchanged', False), ('qualificationSHA256', 'd' * 64)]:
                bad = copy.deepcopy(self.record); bad['sourceComparison'][key] = changed
                with self.subTest(key=key), self.assertRaises(M.MockInputError): self.open(record=bad)

    def test_exact_canonical_type_and_external_digest_required(self):
        with patch.dict(sys.modules, {'w15_github_runtime_inputs': self.module}), patch.object(M.Mock500Inputs, 'check_sources'):
            with self.assertRaises(M.MockInputError):
                M.open_inputs(SimpleNamespace(check_sources=Mock()), context=self.ctx,
                    binding_raw=M.canonical(self.record), binding_sha256='f' * 64,
                    asset_paths=self.paths, observed_context=self.observed)
            with self.assertRaises(M.MockInputError):
                M.open_inputs(self.runtime, context=self.ctx, binding_raw=M.canonical(self.record), binding_sha256='f' * 64,
                    asset_paths=self.paths, observed_context=self.observed)

    def test_claim_is_once_and_backup_scope_is_explicit_mock(self):
        with patch.dict(sys.modules, {'w15_github_runtime_inputs': self.module}), patch.object(M.Mock500Inputs, 'check_sources'):
            bound = self.open(); resource = SimpleNamespace(check_context=Mock())
            bound.claim(resource)
            with self.assertRaises(M.MockInputError): bound.claim(resource)
            resource.check_context.assert_called_once_with(self.ctx)
            self.assertEqual(bound.backup_context()['scope'], 'ISOLATED_GITHUB_MOCK500_BACKUP_ONLY')
            self.assertEqual(bound.backup_context()['inputManifestSHA'], self.ctx['inputManifestPin']['sha256'])
            self.assertFalse(bound.backup_context()['executionAuthority'])

    def test_additional_disk_bytes_include_all_extra_sources_and_reject_unknown(self):
        with patch.dict(sys.modules, {'w15_github_runtime_inputs': self.module}), patch.object(M.Mock500Inputs, 'check_sources'):
            bound = self.open()
            self.assertEqual(bound.declared_additional_input_bytes(), 11 * 3)
            for amount in (None, 0, True):
                bound._record['assets']['qualifiedRows']['bytes'] = amount
                with self.assertRaises(M.MockInputError): bound.declared_additional_input_bytes()

    def test_namespace_rejects_stale_work_and_unbound_nonce(self):
        self.assertEqual(M.namespace(self.ctx)['database'], M.DATABASE)
        for key, value in [('hostPaths', {**self.ctx['hostPaths'], 'work': '/OLD'}), ('runAttempt', True),
                           ('scope', 'ISOLATED_GITHUB_END500_BINDING_ONLY'), ('nonce', 'INVALID')]:
            bad = copy.deepcopy(self.ctx); bad[key] = value
            with self.subTest(key=key), self.assertRaises((M.MockInputError, ValueError)): M.namespace(bad)

    def test_private_file_pin_reads_no_symlink_or_hardlink(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); path = root / 'fictional'; path.write_bytes(b'FICTIONAL'); path.chmod(0o600)
            pin = {'bytes': 9, 'sha256': hashlib.sha256(b'FICTIONAL').hexdigest()}
            self.assertEqual(M.file_bytes(path, pin), b'FICTIONAL')
            wrong = {**pin, 'sha256': '0' * 64}
            with self.assertRaises(M.MockInputError): M.file_bytes(path, wrong)
            link = root / 'link'; link.symlink_to(path)
            with self.assertRaises(OSError): M.file_bytes(link, pin)
            os.link(path, root / 'hardlink')
            with self.assertRaises(M.MockInputError): M.file_bytes(path, pin)


class AtomicProofChecks(unittest.TestCase):
    def fixture(self):
        documents = {}
        for filename, count in [('PREPARE.SAFE.json', 1), ('ATOMIC_AUTH_PREPARED0.SAFE.json', 6), ('ATOMIC_EU.SAFE.json', 5)]:
            row_id = 'main-auth' if count != 5 else 'w15-eu-component-26d5a413-5ca7-415c-a412-62fc45b561c8'
            outer = [{'id': i, 'kind': 'public-mutation', 'beginMS': i * 100,
                'ackMS': i * 100 + 50, 'endMS': i * 100 + 60, 'wallMs': 60, 'acknowledged': True} for i in range(count)]
            writes = [{'envelopeId': i, 'rowId': row_id, 'storageMode': 'relational-atomic-v1',
                'beginMS': i * 100 + 10, 'ackMS': i * 100 + 30, 'endMS': i * 100 + 40, 'wallMs': 30,
                'acknowledged': True} for i in range(count)]
            documents[filename] = {'authCoverage': {'pass': True}, 'authMutations': outer, 'usageSinks': [],
                'casWrites': writes, 'rowId': row_id, 'originalMainAuthUnchanged': True}
        review = {'status': 'PASS_PREPARED0_ATOMIC_AND_EU_COMPONENTS_ONLY_RAM_AND_FULL500_OPEN',
            'independentOfImplementation': True, 'testsRepeatedByReviewer': False,
            'evidencePins': [{'path': '/FICTIONAL/' + name, 'bytes': len(M.canonical(value)),
                'sha256': hashlib.sha256(M.canonical(value)).hexdigest()} for name, value in documents.items()]}
        return documents, review

    def test_twelve_real_timing_records_are_bound_without_api_replay(self):
        docs, review = self.fixture()
        def read(path, *args, **kwargs): return M.canonical(docs[Path(path).name])
        with patch.object(Path, 'read_bytes', return_value=M.canonical(review)), patch.object(M, 'file_bytes', side_effect=read):
            result = M.validate_atomic_auth(Path('/FICTIONAL'))
        self.assertEqual(result['atomicACKs'], 12); self.assertFalse(result['APIsRepeated'])

    def test_blob_unassigned_and_thirty_second_records_cannot_replace_atomic_acks(self):
        for changed in ('blob', 'unassigned', 'slow', 'eu-original-mutated'):
            docs, review = self.fixture()
            row = docs['ATOMIC_AUTH_PREPARED0.SAFE.json']['casWrites'][0]
            if changed == 'blob': row['storageMode'] = 'blob'
            elif changed == 'unassigned': row['envelopeId'] = 99
            elif changed == 'slow': row['wallMs'] = 30000
            else: docs['ATOMIC_EU.SAFE.json']['originalMainAuthUnchanged'] = False
            with patch.object(Path, 'read_bytes', return_value=M.canonical(review)), \
                    patch.object(M, 'file_bytes', side_effect=lambda path, *a, **k: M.canonical(docs[Path(path).name])):
                with self.subTest(changed=changed), self.assertRaises((M.MockInputError, KeyError)):
                    M.validate_atomic_auth(Path('/FICTIONAL'))


class SourceReuseChecks(unittest.TestCase):
    def fixture(self):
        def pin(raw): return {'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}
        sources = {'lib/fictional-' + str(i) + '.js': b'FICTIONAL' + str(i).encode() for i in range(16)}
        unchanged = [{'path': name, **pin(raw)} for name, raw in sources.items()]
        rebound = []
        ai = b'const LAGE_BRIEFING_SCHEMA = FICTIONAL_ONLY;'
        storage = b'async function getPublicationSourceIdentities(FICTIONAL) {}'
        for name, raw, segment in [('lib/helmut/ai.js', b'HEADER\n' + ai, ai),
            ('lib/helmut/storage.js', b'HEADER\n' + storage + b'\nasync function next() {}', storage)]:
            sources[name] = raw
            rebound.append({'oldPin': {'path': name, 'bytes': 5, 'sha256': 'a' * 64},
                'currentPin': {'path': '/OLD/' + name, **pin(raw)},
                'unchangedSegmentBytes': len(segment), 'unchangedSegmentSHA256': hashlib.sha256(segment).hexdigest()})
        public = {'status': 'PASS_SCOPED_REUSE_NOT_NEW_ALL500_RUN', 'original500PassRetained': True,
            'constructorChecksRepeated': False, 'unchangedSourcePins': unchanged, 'reboundSourcePins': rebound,
            'qualificationPin': {'bytes': 13706128, 'sha256': 'd2603d926508a1655b415b18734fe37bc1a660dccb6f139ae43b1859a11bed3d'}}
        qualification = {'sourceCodePins': unchanged + [row['oldPin'] for row in rebound]}
        def read(path, expected, **kwargs):
            raw = sources[str(Path(path).relative_to('/FICTIONAL'))]
            M.need(pin(raw) == expected)
            return raw
        return sources, public, qualification, read

    def test_16_plus_2_source_bridge_reads_only_pins_and_preserved_segments(self):
        sources, public, qualification, read = self.fixture()
        with patch.object(Path, 'read_bytes', return_value=M.canonical(public)), patch.object(M, 'file_bytes', side_effect=read):
            result = M.validate_source_compatibility(qualification, Path('/FICTIONAL'))
        self.assertEqual(result['unchangedSources'], 16); self.assertEqual(result['scopedCodeBindings'], 2)
        self.assertFalse(result['constructorChecksRepeated']); self.assertFalse(result['executionAuthority'])

    def test_unreviewed_source_or_critical_segment_change_cannot_reuse_old_pass(self):
        for change in ('source-pin', 'segment'):
            sources, public, qualification, read = self.fixture()
            if change == 'source-pin': sources['lib/fictional-0.js'] += b'CHANGED'
            else:
                sources['lib/helmut/ai.js'] += b'CHANGED'
                public['reboundSourcePins'][0]['currentPin'].update(bytes=len(sources['lib/helmut/ai.js']),
                    sha256=hashlib.sha256(sources['lib/helmut/ai.js']).hexdigest())
            with patch.object(Path, 'read_bytes', return_value=M.canonical(public)), patch.object(M, 'file_bytes', side_effect=read):
                with self.subTest(change=change), self.assertRaises(M.MockInputError):
                    M.validate_source_compatibility(qualification, Path('/FICTIONAL'))


class ControllerAdmissionChecks(unittest.TestCase):
    def load_controller(self):
        path = HERE.parent / 'synthetik-500-w15-full500-controller.py'
        spec = importlib.util.spec_from_file_location('w15_mock500_controller_fictional_test', path)
        controller = importlib.util.module_from_spec(spec); sys.modules[spec.name] = controller
        self.addCleanup(sys.modules.pop, spec.name)
        spec.loader.exec_module(controller)
        return controller

    def test_default_controller_and_noncanonical_input_have_no_effect(self):
        controller = self.load_controller()
        with patch.object(controller, 'docker') as docker, patch.object(controller, 'call') as command:
            with self.assertRaisesRegex(RuntimeError, 'new-explicit-user-go'):
                controller.main()
            with patch.object(controller, '_mock_module', return_value=SimpleNamespace(Mock500Inputs=M.Mock500Inputs)):
                with self.assertRaises(AssertionError): controller.run_bound(object(), object(), object(), Mock())
            docker.assert_not_called(); command.assert_not_called()

    def test_backup_deadline_is_independent_of_owned_stop_policy(self):
        controller = self.load_controller()
        with tempfile.TemporaryDirectory(prefix='w15-fictional-mock-clock-') as temp:
            root = Path(temp)
            values = {'memory.max': '2048000000', 'memory.swap.max': '0', 'memory.peak': '1',
                'memory.current': '1', 'memory.swap.current': '0', 'memory.events': 'max 0\noom 0\noom_kill 0\noom_group_kill 0\n'}
            for name, value in values.items(): (root / name).write_text(value)
            supervisor = controller.Supervisor.__new__(controller.Supervisor)
            supervisor.start_guard = SimpleNamespace(closure_guard=Mock(), before_dispatch=Mock())
            supervisor.closure_mode = False; supervisor.mock_backup_closure = True
            supervisor.disk_guard = supervisor.common_resources = None
            supervisor.stage_name = 'backup-before'; supervisor.cgroup = root; supervisor.maximum = 0
            with patch.object(controller, 'WORK', root / 'FICTIONAL_WORK'):
                supervisor.sample()
                supervisor.start_guard.closure_guard.assert_called_once()
                supervisor.start_guard.before_dispatch.assert_not_called()
                supervisor.mock_backup_closure = False; supervisor.sample()
                supervisor.start_guard.before_dispatch.assert_called_once()

    def test_fictional_bound_pipeline_orders_restore_materials_runtime_zero_audit_and_backup(self):
        controller = self.load_controller()
        temp = tempfile.TemporaryDirectory(prefix='w15-fictional-mock-pipeline-'); self.addCleanup(temp.cleanup)
        ctx = context(temp.name); ctx['runtimePins']['imageId'] = 'sha256:' + 'c' * 64
        names = M.namespace(ctx); work = names['work']; events = []; container_state = {'running': False}
        original = controller.WORK, controller.BASE, controller.DB, controller.CONTAINER, controller.IMAGE
        def write(path, value):
            raw = value if isinstance(value, bytes) else M.canonical(value)
            path.write_bytes(raw); path.chmod(0o600)
        paths = {key: str(Path(temp.name) / key) for key in M.ASSETS | {'node', 'postgrest'}}
        for key in ('localRoles', 'frozenSourceDump', 'publicationPolicy'):
            path = Path(temp.name) / key; write(path, b'FICTIONAL'); paths[key] = str(path)
        received = SimpleNamespace(check_sources=Mock(), path=lambda key: Path(paths[key]))
        inputs = M.Mock500Inputs(M.TOKEN, received, ctx, record(ctx), paths, M.REPO, 'd' * 64)
        inputs.check_sources = Mock()
        inputs.path = Mock(side_effect=lambda key: Path(paths[key]))
        def stage_sources(destination, guard):
            events.append('stage'); destination.mkdir(mode=0o700); (destination / 'app').mkdir(mode=0o700)
            for name in ('node', 'postgrest'): write(destination / name, b'FICTIONAL')
            guard()
        inputs.stage_sources = stage_sources
        class Resource:
            def __init__(self):
                self.path = Path(temp.name) / 'FICTIONAL_CGROUP'
                self.unit = 'w15_123456789_' + NONCE.replace('-', '') + '.slice'
            def check_context(self, value): assert value == ctx
            def check_pid(self, pid, container): events.append('pid-bound')
            def sample(self): return {'FICTIONAL': True}
            def last_observation(self): return {'FICTIONAL': True}
        resource = Resource()
        class Start:
            context = ctx
            resources = resource
            admission = {'FICTIONAL': True}
            def before_dispatch(self, **kwargs): events.append('admission')
            def closure_guard(self): return None
            @property
            def window(self):
                now = datetime.now(timezone.utc)
                return {key: (now + timedelta(seconds=seconds)).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
                    for key, seconds in [('startsAtUTC', 0), ('endsAtUTC', 10800), ('completionDeadlineUTC', 12600)]}
        class Thread:
            alive = False
            def start(self): self.alive = True
            def is_alive(self): return self.alive
        class Supervisor:
            def __init__(self, path):
                self.thread, self.reporter = Thread(), Thread(); self.reporter.start()
                self.failure = self.stop_failure = None; self.finished = SimpleNamespace(is_set=lambda: not self.thread.alive)
            def sample(self): resource.sample()
            def stop(self): self.thread.alive = self.reporter.alive = False; events.append('watch-closed')
            def stage(self, command, phase, seconds, extra_env=None):
                events.append(phase)
                if phase == 'materials':
                    for name in ('current-command.PRIVATE.json', 'mock-fixtures.PRIVATE.json', 'audit-inputs.PRIVATE.json'):
                        write(work / name, {'FICTIONAL': True})
                    write(work / 'processing-materials.PRIVATE.json', start.window)
                elif phase == 'run':
                    write(work / 'state/FULL500_RUNTIME_RESULT.SAFE.json', {'completedUnits': 500, 'localSimulations': 1000,
                        'technicallyStoredPositions': 1500, 'checks': {'all8000FreshControls': True, 'everyAuthAssignedAndUnder30': True}})
                elif phase == 'audit':
                    write(work / 'state/RESULTS_INDEPENDENT.SAFE.json', {'storedResultsAccepted': True})
        start = Start()
        def native_restore(*args): events.append('restore'); return {'profiles': 500, 'active': 0}
        modules = {'mock500_inputs': M, 'mock500_resources': SimpleNamespace(MockCommonResources=Resource),
            'mock500_start': SimpleNamespace(StartGuard=Start), 'mock500_backup': SimpleNamespace(restore_database=native_restore)}
        def docker(*args, **kwargs):
            if args[:2] == ('image', 'inspect'): return json.dumps([{'Id': ctx['runtimePins']['imageId']}]).encode()
            if args[0] == 'ps': return b''
            if args[0] == 'create': events.append('container-created'); return b'e' * 64
            if args[0] == 'start': container_state['running'] = True
            if args[0] == 'stop': container_state['running'] = False; events.append('container-stopped')
            return b''
        def inspect(*args):
            return {'Id': 'e' * 64, 'State': {'Running': container_state['running'],
                'Pid': 42 if container_state['running'] else 0, 'OOMKilled': False, 'ExitCode': 0}}
        def copy_in(source, destination): shutil.copyfile(source, work / 'state' / destination.rsplit('/', 1)[-1])
        def copy_out(name):
            source = work / 'state' / name
            if source.exists() and not (work / name).exists(): shutil.copyfile(source, work / name)
        class Gateway:
            stopped = False
            def __init__(self, *args, **kwargs): write(work / 'state/runtime-public.PRIVATE.json', {'FICTIONAL': True})
            def poll(self): return 0 if self.stopped else None
            def wait(self, **kwargs):
                self.stopped = True
                write(work / 'state/SERVICE_CLOSURE.SAFE.json', {'status': 'PASS_OWNED_MOCK500_SERVICES_CHILD_CLOSE',
                    'postgrestChildClose': {'code': 0, 'signal': None}, 'postgrestSignalAccepted': True,
                    'gatewayStopped': True, 'forced': False, 'journal': {'closed': True, 'pendingEntries': 0}})
                return 0
        def cleanup():
            events.append('zero'); value = {'confirmedZero': True, 'nativeBoundZero': True, 'after': {'active': 0}}
            controller.save('CLEANUP.SAFE.json', value); return value
        def complete(**kwargs):
            events.append('backup')
            self.assertTrue(kwargs['supervisor'].thread.is_alive())
            self.assertTrue((work / 'CONTROLLER_BODY.SAFE.json').exists())
            self.assertTrue((work / 'RESULTS_INDEPENDENT.SAFE.json').exists())
            kwargs['close_owned']()
            return dict.fromkeys(('remoteReadbackObserved', 'databaseRestoreObserved', 'ownedContainerStopped', 'watchClosed'), True)
        with patch.object(controller, '_mock_module', side_effect=lambda name: modules[name]), \
                patch.object(controller, 'Supervisor', Supervisor), patch.object(controller, 'docker', side_effect=docker), \
                patch.object(controller, '_bound_container', side_effect=inspect), \
                patch.object(controller, 'read', side_effect=lambda query: {'FICTIONAL': True} if 'jsonb_build_object' in query else 0), \
                patch.object(controller, 'sql'), patch.object(controller, 'copy_in', side_effect=copy_in), \
                patch.object(controller, 'copy_out', side_effect=copy_out), patch.object(controller, 'cleanup', side_effect=cleanup), \
                patch.object(controller, 'stop_owned'), patch.object(controller.subprocess, 'Popen', Gateway), \
                patch.object(controller.subprocess, 'run', side_effect=lambda argv, **kwargs: subprocess.CompletedProcess(argv, 0)):
            try: result = controller.run_bound(inputs, resource, start, complete, disk_guard=Mock())
            except RuntimeError:
                final_path = Path(ctx['hostPaths']['runRoot']) / 'FINAL_MOCK500_CLOSURE.SAFE.json'
                self.fail(str(events) + ' ' + str(json.loads(final_path.read_bytes()) if final_path.exists() else {}))
        self.assertEqual(result['status'], 'PASS_MOCK500_BODY_AND_BACKUP_INDEPENDENT_ACCEPTANCE_PENDING')
        self.assertFalse(result['mock500Acceptance'])
        for before, after in [('restore', 'setup'), ('materials', 'prepare'), ('prepare', 'run'), ('run', 'zero'),
            ('zero', 'audit'), ('audit', 'backup'), ('backup', 'container-stopped'), ('container-stopped', 'watch-closed')]:
            self.assertLess(events.index(before), events.index(after))
        self.assertEqual(events.count('restore'), 1); self.assertEqual(events.count('run'), 1)
        self.assertEqual(events.count('backup'), 1); self.assertEqual(events.count('container-stopped'), 1)
        self.assertEqual((controller.WORK, controller.BASE, controller.DB, controller.CONTAINER, controller.IMAGE), original)
        self.assertTrue((Path(ctx['hostPaths']['runRoot']) / 'FINAL_MOCK500_CLOSURE.SAFE.json').exists())
        self.assertFalse((work / 'FINAL_MOCK500_CLOSURE.SAFE.json').exists())


if __name__ == '__main__': unittest.main()
