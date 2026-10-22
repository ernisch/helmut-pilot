"""Pure supervisor/producer integration: temporary files and fake Popen only.

No DB, Docker, network, GO issuance or actual native child. The existing owner
fixture replaces constants in its PRIVATE module instance, never native scope.
"""
import ast
import base64
import copy
import importlib.util
import json
import os
from pathlib import Path
import signal
import sys
import tempfile
import threading
import types
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent


def load(name, source):
    spec = importlib.util.spec_from_file_location(name, source)
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    return m


FIXTURE = load('pure_owner_fixture_support', HERE / 'local-postgrest-owner-test.py')


class IntegrationTests(FIXTURE.OwnerTests):
    # Inherits the owner guards and adds actual integration boundary checks.
    def make_backend(self):
        m = self.m
        b = m.SupervisedBackend.__new__(m.SupervisedBackend)
        b.plan = {'operationId': self.scope['operationId']}
        b.host = {'containerId': self.scope['containerId']}
        b.scope_pin = self.producer['scopePin']
        b.scope = self.scope
        b.request_hash = self.scope['requestSHA256']
        b.failure = None
        b.child = FIXTURE.Child(['pure-supervisor-owned-python'], code=0)
        m.STOP_PATH = self.root / 'stop-metadata.json'
        m.SCOPE_PATH = self.root / 'scope.json'
        m.RESULT_PATH = self.root / 'receipt.json'
        m.ACK_PATH = self.root / 'ack.json'
        self.file(m.SCOPE_PATH, m.canonical({'nonce': self.scope['nonce']}))
        self.file(m.ACK_PATH, b'{}')
        self.file(m.RESULT_PATH, m.canonical({'pass': True, 'scopePin': b.scope_pin,
            'containerId': b.host['containerId'], 'operationId': b.plan['operationId'], 'nonce': b.scope['nonce'],
            'configPin': b.scope['configPin'], 'requestSHA256': b.request_hash}))
        return b

    def test_supervisor_requires_both_real_owned_exit_and_receipt(self):
        b = self.make_backend()
        with patch.object(self.m, 'root_metadata', side_effect=lambda p, v: self.file(p, self.m.canonical(v))):
            self.assertTrue(b.finish()['pass'])
        self.assertEqual(b.child.waits, [50])
        self.m.STOP_PATH.unlink(); b.child.code = 1; b.child.state = None
        with patch.object(self.m, 'root_metadata', side_effect=lambda p, v: self.file(p, self.m.canonical(v))):
            self.assertFalse(b.finish()['pass'])

    def test_supervisor_rejects_missing_start_ack_even_positive_receipt(self):
        b = self.make_backend(); self.m.ACK_PATH.unlink()
        with patch.object(self.m, 'root_metadata', side_effect=lambda p, v: self.file(p, self.m.canonical(v))):
            self.assertFalse(b.finish()['pass'])

    def test_supervisor_never_started_is_not_positive_closure(self):
        b = self.make_backend(); b.child = None
        self.assertFalse(b.finish()['pass'])

    def test_root_metadata_is_public_nonsecret_while_private_config_stays_uid_bound(self):
        target = self.root / 'metadata.json'
        with patch.object(self.m.os, 'geteuid', return_value=0):
            self.m.root_metadata(target, {'publicDigest': 'e' * 64})
        self.assertEqual(target.stat().st_mode & 0o777, 0o644)
        self.assertEqual(Path(self.m.CONFIG_PATH).stat().st_mode & 0o777, 0o600)
        with patch.object(self.m.os, 'geteuid', return_value=1234):
            with self.assertRaises(ValueError): self.m.root_metadata(self.root / 'foreign.json', {})

    def test_atomic_publication_never_exposes_partial_request_or_two_links(self):
        m = self.m
        target = self.root / 'atomic-request.json'
        m.REQUEST_PATH = target
        b = m.SupervisedBackend.__new__(m.SupervisedBackend)
        b.child = None; b.request_consumed = False; b.observe_kernel = lambda: None
        pending, resume = threading.Event(), threading.Event()
        errors = []
        original = os.fsync
        def fsync(fd):
            original(fd)
            if not pending.is_set():
                pending.set()
                if not resume.wait(5): raise TimeoutError('pure test publication pause')
        raw = b'{"complete":true}'
        def write():
            try: m.publish_bytes(target, raw)
            except BaseException as error: errors.append(error)
        with patch.object(m.os, 'fsync', side_effect=fsync):
            writer = threading.Thread(target=write); writer.start()
            try:
                self.assertTrue(pending.wait(5))
                self.assertFalse(target.exists())
                b.tick()
                self.assertFalse(b.request_consumed)
            finally:
                resume.set(); writer.join(5)
        self.assertFalse(writer.is_alive()); self.assertEqual(errors, [])
        self.assertEqual(target.read_bytes(), raw)
        self.assertEqual(target.stat().st_nlink, 1)
        self.assertEqual(target.stat().st_mode & 0o777, 0o600)
        with self.assertRaises(FileExistsError): m.publish_bytes(target, b'overwrite')
        self.assertEqual(target.read_bytes(), raw)

    def test_unavailable_atomic_publisher_fails_closed_without_final_path(self):
        target = self.root / 'unsupported.json'
        with patch('ctypes.CDLL', side_effect=OSError('pure unavailable libc')):
            with self.assertRaises(OSError): self.m.publish_bytes(target, b'complete')
        self.assertFalse(target.exists())

    def test_request_identity_validation_checks_real_claim_and_activation(self):
        m = self.m
        b = m.SupervisedBackend.__new__(m.SupervisedBackend)
        case = Path(self.scope['caseDirectory'])
        # Pure file paths are redirected in this one module; no real case exists.
        case = self.root / 'case'
        n = case / 'native-end-preparation'; n.mkdir(parents=True)
        owner = self.file(self.root / 'go.json', m.canonical({'schema': 'helmut-owner-local-fixture-go/1',
            'production': False, 'syntheticProfiles': 500, 'allowDispose': False, 'targetDatabase': self.target}))
        cfg_pin = self.producer['scopePin']
        accept = self.file(self.root / 'accept.json', b'{}')
        reservation = self.file(self.root / 'reservation.json', m.canonical({'controllerInvocationId': 'd' * 32, 'freshOwnerGO': owner}))
        claim = self.file(self.root / 'claim.json', m.canonical({'schema': 'helmut-local-resource-attempt-claim/1',
            'noAutomaticRetry': True, 'freshOwnerGO': owner, 'independentMeterAcceptance': accept,
            'containerId': 'f' * 64, 'recipeSHA256': 'e' * 64}))
        activation = self.file(n / 'LOCAL_ACTIVATION_RESULT.SAFE.json', m.canonical({'pass': True, 'target': self.target,
            'actualInactive': 500, 'actualActiveAfter': 500, 'ownerGoPin': owner,
            'sourceProfileHashUnchanged': True, 'newTargetProfileFachHashUnchanged': True}))
        target = self.file(n / 'LOCAL_NEW_FIXTURE.PRIVATE.json', m.canonical({'database': self.target,
            'container': 'pure-owned-db', 'ownerGoPin': owner}))
        m.HOST_BINDING = self.root / 'host.json'; self.file(m.HOST_BINDING, b'{}')
        m.KERNEL_BINDING = self.root / 'kernel.json'; self.file(m.KERNEL_BINDING, b'{}')
        m.DATABASE_CONFIG = self.root / 'database.json'; self.file(m.DATABASE_CONFIG, b'{}')
        b.host_pin = m.file_pin(m.HOST_BINDING); b.kernel_pin = m.file_pin(m.KERNEL_BINDING); b.cfg_pin = m.file_pin(m.DATABASE_CONFIG)
        b.host = {'localPostgrestBackendPlanPin': cfg_pin, 'controllerInvocationId': 'd' * 32,
            'setupReservationPin': reservation, 'independentMeterAcceptancePin': accept, 'containerName': 'pure-owned-db'}
        b.plan = {key: self.scope[key] for key in ['day', 'targetDatabase', 'operationId', 'sourcePins']}
        b.plan.update(caseDirectory=str(case), ownerGoPin=owner, sourcePostgrestConfigPin=self.scope['templatePin'], resourceClaimPath=claim['path'])
        r = {'schema': 'helmut-local-supervised-postgrest-service-request/1', 'production': False, 'automaticRetry': False,
            'nonce': 'c' * 32, 'requestedAtUTC': '2026-10-22T01:00:00Z',
            'localPostgrestBackendPlanPin': cfg_pin, 'activationResultPin': activation, 'targetConfigPin': target,
            'derivedConfigBase64': base64.b64encode(Path(self.m.CONFIG_PATH).read_bytes()).decode(),
            'jwtSecretSHA256': self.scope['jwtSecretSHA256'], 'sourceBinding': 'a' * 64,
            'globalClaimPin': claim, 'recipeSHA256': 'e' * 64, 'appContainerId': 'f' * 64, 'controllerInvocationId': 'd' * 32}
        r.update({key: b.plan[key] for key in ['day','caseDirectory','targetDatabase','operationId','ownerGoPin','sourcePostgrestConfigPin','sourcePins']})
        self.assertEqual(b.validate_request(r), Path(self.m.CONFIG_PATH).read_bytes())
        for change in [{'appContainerId': '0' * 64}, {'recipeSHA256': '0' * 64}, {'controllerInvocationId': '0' * 32},
                       {'nonce': 'bad'}, {'production': True}, {'automaticRetry': True}, {'unknown': True}]:
            bad = {**r, **change}
            with self.subTest(change=list(change)):
                with self.assertRaises(Exception): b.validate_request(bad)
        data = json.loads(Path(activation['path']).read_text()); data['actualActiveAfter'] = 499
        r['activationResultPin'] = self.file(Path(activation['path']), m.canonical(data))
        with self.assertRaises(ValueError): b.validate_request(r)

    def test_supervisor_closes_owner_before_namespace_signals_and_pg_stop(self):
        self.supervisor_cleanup()

    def test_failed_failure_report_still_closes_owner_before_pg_and_stays_failed(self):
        self.supervisor_cleanup(report_failure=True)

    def supervisor_cleanup(self, report_failure=False):
        events = []
        net = types.ModuleType('network_meter'); net.network = net.settled_network = lambda: {}
        storage = types.ModuleType('storage_proof'); storage.verify = lambda *a: {'provenUpperBytes': 42}
        with patch.dict(sys.modules, {'network_meter': net, 'storage_proof': storage}):
            s = load('pure_database_supervisor_fixture', HERE / 'database-supervisor.py')
        out = self.root / 'supervisor-out'; out.mkdir()
        pgdata = self.root / 'pgdata'
        cfg = {'scope': 'owner-approved-local500-resources', 'freshInitdbVolume': True, 'pgdata': str(pgdata),
            'stopFile': str(out / 'stop'), 'finalFile': str(out / 'final'), 'storageReadyPin': {}, 'localPostgrestBackendPlanPin': {}}
        cfg_path = self.root / 'supervisor-cfg.json'; self.file(cfg_path, json.dumps(cfg).encode())
        proc = self.root / 'proc'; proc.mkdir()
        real_path = Path
        def path(value, *args):
            if str(value) == '/meter-output' or str(value).startswith('/meter-output/'):
                return out / str(value).removeprefix('/meter-output').lstrip('/')
            if value == '/proc': events.append('generic_namespace_scan'); return proc
            return real_path(value, *args)
        pg = FIXTURE.Child(['pure-postgres'], code=0)
        class Backend:
            def __init__(self, config): self.failure = None
            def tick(self):
                (pgdata / 'postmaster.pid').write_text('99\n'); (out / 'stop').touch()
                if report_failure: raise ValueError('pure tick failure')
            def finish(self): events.append('owner_finish'); return {'pass': self.failure is None, 'ownerExitCode': 0}
        def report(*args): raise OSError('pure reporting failure')
        result = []
        control = 'Database cluster state: shut down\nLatest checkpoint location: 0/1000\nBytes per WAL segment: 16777216\n'
        with patch.object(s, 'Path', side_effect=path), patch.object(s.sys, 'argv', ['supervisor', str(cfg_path)]), \
            patch.object(s, 'owner_module', return_value=types.SimpleNamespace(SupervisedBackend=Backend, root_metadata=report)), \
            patch.object(s.subprocess, 'Popen', return_value=pg), \
            patch.object(s.subprocess, 'run', return_value=types.SimpleNamespace(stdout=control)), \
            patch.object(s.os, 'kill', side_effect=lambda *a: events.append('pg_signal')), \
            patch.object(s.os, 'waitpid', side_effect=ChildProcessError), \
            patch.object(s, 'output', side_effect=lambda p, v: result.append(v)):
            self.assertEqual(s.main(), 1 if report_failure else 0)
        self.assertLess(events.index('owner_finish'), events.index('generic_namespace_scan'))
        self.assertLess(events.index('owner_finish'), events.index('pg_signal'))
        self.assertEqual(result[0]['localPostgrestBackend']['pass'], not report_failure)

    def test_isolation_optional_overlays_and_real_cgroup_fields_are_explicit(self):
        # AST checks refer to the executable branches, not strings in comments.
        tree = ast.parse((HERE / 'isolation.py').read_text())
        functions = {n.name: n for n in tree.body if isinstance(n, ast.FunctionDef)}
        database = ast.get_source_segment((HERE / 'isolation.py').read_text(), functions['create_database'])
        self.assertIn("observed['HostConfig']['PidMode']!=''", database)
        self.assertIn("Path('/proc',str(host_pid),'cgroup').read_text()", database)
        self.assertIn("(group/'cgroup.procs').read_text()", database)
        self.assertIn("'kernelObservedBeforeStart':False", database)
        self.assertIn("'kernelObservedAfterStart':True", database)
        launch = ast.get_source_segment((HERE / 'isolation.py').read_text(), functions['launch_application'])
        self.assertIn("for destination in ['/meter-database',database['out']]", launch)
        self.assertIn("+',dst='+destination+'/control'", launch)
        self.assertIn("cfg['stopFile']='/meter-output/control/STOP_DATABASE'", database)
        self.assertNotIn('cgroupns=host', launch + database)

    def test_backend_plan_requires_complete_code_and_upstream_pins(self):
        m = self.m
        m.ORIGINAL_BINARY_PATH = m.BINARY_PATH  # private fixture; never executable
        helper = self.file(self.root / 'scripts/helmut-resource-meter/local-postgrest-services.js', b'pure JS helper fixture')
        owner = self.file(self.root / 'owner-go.json', b'{"pureFixture":true}')
        plan = {key: self.scope[key] for key in ['production','automaticRetry','day','caseDirectory','targetDatabase','operationId',
            'binaryPin','upstreamEvidencePin','upstreamSourcePins','workEndsAtUTC','closeByUTC','maximumLifecycleSeconds',
            'logLimitBytes','waitSeconds','killWaitSeconds','drainWaitSeconds']}
        plan.update(schema='helmut-local-supervised-postgrest-backend-plan/1',mode='supervised-owner-v1',ownerGoPin=owner,
            sourcePostgrestConfigPin=self.scope['templatePin'],sourcePins=[*self.scope['sourcePins'],helper],
            resourceClaimPath='/workspace/helmut-parallel-20261015/wave19-resource-meter/NEXT_RESOURCE22_V99_GO_CLAIM.SAFE.json')
        def read(value):
            pin=self.file(self.root/'backend-plan.json',m.canonical(value))
            return m.read_backend_plan(pin,case_directory=plan['caseDirectory'],target_database=plan['targetDatabase'],operation_id=plan['operationId'])
        self.assertEqual(read(plan),plan)
        for mutation in [{'sourcePins':plan['sourcePins'][:-1]},{'mode':'legacy'},{'production':True},{'unknown':True}]:
            with self.subTest(mutation=list(mutation)):
                with self.assertRaises(Exception):read({**plan,**mutation})


if __name__ == '__main__':
    unittest.main(verbosity=2)
