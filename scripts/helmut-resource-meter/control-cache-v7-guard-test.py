#!/usr/bin/env python3
"""Prepared, NOT RUN: fake-child and temporary-receipt security contracts only.

No Popen, subprocess command, DB, Docker, network or native resource is created.
The fake PASS receipts are unit fixtures in TemporaryDirectory, never actual
native evidence. Only the two authenticated inert subject modules are compiled
when Root explicitly runs this file. No guard function is replaced or mocked.
"""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import types
import unittest

sys.dont_write_bytecode = True
C = H = PREPARED = None
DEFAULT_PREPARED = '/workspace/helmut-cpu-epoch-20261015/scripts/helmut-resource-meter/control-cache-native-v7-launcher/PREPARED.SAFE.json'
DEFAULT_SHA = 'a09c91e4d70e1b6f7b656e7b51f932c0133ce51b1fd8c43535d456dd71a24666'
DEFAULT_BYTES = 26924
MODULE_HASHES = {
    'common.py': 'fc931ec9292fabf5f8926c748b87c2b29073f562d84907a58e15b5b405511909',
    'postgrest_lifecycle.py': '5afe6bd739a242ca1ce24a4127682fae3dc7d301541445b3ba7dcebfc059eb63',
}
EXPECTED_POLICY = {
    'schema': 'helmut-original-postgrest-12.2.3-sigterm-policy/1',
    'postgrestVersion': '12.2.3',
    'originalBinarySHA256': '870a77f49508479bc87c5504b6b0c3715c7220926932d916b0d73952b297c617',
    'originalBinaryBytes': 17309560,
    'configSHA256': '47a9c99a305e9975a479bc1da8f30cdd6664dddf8fb279df1c15bc5b17c63f60',
    'configBytes': 236,
    'upstreamEvidenceSHA256': '218646bd1d3e415348dedefd8b7920bd7e09bf293c94f407bf83ddbef7fd9884',
    'requestedSignal': 'SIGTERM', 'additionalSignedExitCode': -2,
}
BINARY_PATH = '/workspace/helmut-parallel-20261015/wave20-resource-integration/source-capture/postgrest-pinned'
CLASSIFICATION = 'expected-original-12.2.3-sigterm-userinterrupt-sigint'


def file_pin(path):
    data = path.read_bytes()
    return {'path': str(path), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}


def write_json(path, value):
    path.write_text(json.dumps(value, sort_keys=True) + '\n')
    path.chmod(0o600)
    return file_pin(path)


def pins():
    return {'binary': {'path': BINARY_PATH, 'bytes': 17309560,
                       'sha256': EXPECTED_POLICY['originalBinarySHA256']},
            'config': {'path': '/ram/postgrest.conf', 'bytes': 236,
                       'sha256': EXPECTED_POLICY['configSHA256']}}


class FakeChild:
    """Only method observations and scripted statuses; never a real PID/process."""
    def __init__(self, bound_pins, code=-2, initial=None, timeout_once=False, send_error=False):
        self.pid = 4317
        self.args = [bound_pins['binary']['path'], bound_pins['config']['path']]
        self.code, self.status = code, initial
        self.timeout_once, self.send_error = timeout_once, send_error
        self.signals, self.waits, self.kills = [], [], 0

    def poll(self):
        return self.status

    def send_signal(self, signum):
        self.signals.append(signum)
        if self.send_error:
            raise OSError('FAKE signal failure')

    def wait(self, timeout):
        self.waits.append(timeout)
        if self.timeout_once:
            self.timeout_once = False
            raise subprocess.TimeoutExpired('FAKE CHILD ONLY', timeout)
        self.status = self.code
        return self.code

    def kill(self):
        self.kills += 1


class StopContract(unittest.TestCase):
    def invoke(self, *, bound_pins=None, policy=EXPECTED_POLICY, code=-2,
               proof_change=None, initial=None, timeout_once=False, send_error=False,
               persist_failure=False, argv_change=False, wrong_pid=False):
        bound_pins = copy.deepcopy(bound_pins if bound_pins is not None else pins())
        child = FakeChild(bound_pins, code, initial, timeout_once, send_error)
        if argv_change:
            child.args = ['/unbound/other-binary', bound_pins['config']['path']]
        with tempfile.TemporaryDirectory(prefix='helmut-v7-unit-stop-') as directory:
            log = open(Path(directory) / 'fake.log', 'wb')
            log.write(b'UNIT FIXTURE ONLY: no PostgREST executed\n')
            log.flush()
            proof = {'eofObserved': True, 'drainEnded': True, 'overflow': False,
                     'errors': [], 'versionSeen': True}
            proof.update(proof_change or {})
            persisted = []

            def persist(receipt):
                persisted.append(copy.deepcopy(receipt))
                if persist_failure:
                    raise OSError('FAKE persistence failure')

            receipt = H.stop_postgrest(child, log,
                known_pid=child.pid + (1 if wrong_pid else 0), pins=bound_pins,
                persist=persist, prove_log_eof=lambda: proof,
                shutdown_policy=copy.deepcopy(policy))
            return receipt, child, persisted

    def assertRejected(self, receipt):
        self.assertIs(receipt['pass'], False)
        self.assertIs(receipt['acceptedExpectedTranslation'], False)

    def test_exact_original_minus_two_is_classified_without_rewriting_raw_status(self):
        r, child, stored = self.invoke()
        self.assertIs(r['pass'], True)
        self.assertIs(r['acceptedExpectedTranslation'], True)
        self.assertEqual(r['returnCode'], -2)
        self.assertEqual(r['returnCodeClassification'], CLASSIFICATION)
        self.assertEqual(child.signals, [signal.SIGTERM])
        self.assertEqual(child.kills, 0)
        self.assertEqual(stored, [r])

    def test_other_nonzero_statuses_never_gain_the_minus_two_exception(self):
        for code in (1, 143, -9, -11):
            with self.subTest(code=code):
                r, _, stored = self.invoke(code=code)
                self.assertRejected(r)
                self.assertEqual(r['returnCode'], code)
                self.assertEqual(len(stored), 1)

    def test_existing_zero_and_minus_fifteen_need_no_translation(self):
        for code in (0, -15):
            with self.subTest(code=code):
                r, _, _ = self.invoke(code=code, policy=None)
                self.assertIs(r['pass'], True)
                self.assertIs(r['acceptedExpectedTranslation'], False)
                self.assertEqual(r['returnCode'], code)

    def test_minus_two_rejects_other_binary_or_config_even_with_valid_pin_shapes(self):
        changes = [('binary', 'path', '/another/postgrest'),
                   ('binary', 'sha256', '0' * 64), ('binary', 'bytes', 17309561),
                   ('config', 'path', '/ram/other.conf'),
                   ('config', 'sha256', '0' * 64), ('config', 'bytes', 237)]
        for kind, key, value in changes:
            with self.subTest(kind=kind, field=key):
                p = pins(); p[kind][key] = value
                r, _, _ = self.invoke(bound_pins=p)
                self.assertRejected(r)
                self.assertEqual(r['returnCode'], -2)

    def test_minus_two_rejects_missing_wrong_version_or_unbound_upstream_policy(self):
        cases = [None]
        for key, value in [('postgrestVersion', '12.2.4'),
                           ('upstreamEvidenceSHA256', '0' * 64),
                           ('additionalSignedExitCode', 143)]:
            policy = copy.deepcopy(EXPECTED_POLICY); policy[key] = value; cases.append(policy)
        for policy in cases:
            with self.subTest(policy=policy):
                self.assertRejected(self.invoke(policy=policy)[0])
        self.assertRejected(self.invoke(proof_change={'versionSeen': False})[0])

    def test_minus_two_cannot_mask_failed_closure_or_unbound_child(self):
        scenarios = [dict(initial=-2), dict(timeout_once=True), dict(send_error=True),
                     dict(argv_change=True), dict(wrong_pid=True),
                     dict(proof_change={'eofObserved': False}),
                     dict(proof_change={'drainEnded': False}),
                     dict(proof_change={'overflow': True}),
                     dict(proof_change={'errors': [{'type': 'FAKE ReadError'}]})]
        for options in scenarios:
            with self.subTest(options=options):
                self.assertRejected(self.invoke(**options)[0])

    def test_persistence_failure_clears_pass_and_translation_authority(self):
        r, _, stored = self.invoke(persist_failure=True)
        self.assertRejected(r)
        self.assertEqual(r['returnCode'], -2)
        self.assertEqual(r['persistError'], 'OSError')
        self.assertEqual(len(stored), 1)

    def test_double_stop_never_resignals_or_qualifies_again(self):
        with tempfile.TemporaryDirectory(prefix='helmut-v7-unit-double-') as directory:
            log = open(Path(directory) / 'fake.log', 'wb'); log.write(b'UNIT ONLY\n'); log.flush()
            child = FakeChild(pins())
            kwargs = dict(known_pid=child.pid, pins=pins(), persist=lambda _: None,
                prove_log_eof=lambda: {'eofObserved': True, 'drainEnded': True,
                    'overflow': False, 'errors': [], 'versionSeen': True},
                shutdown_policy=copy.deepcopy(EXPECTED_POLICY))
            first = H.stop_postgrest(child, log, **kwargs)
            second = H.stop_postgrest(child, log, **kwargs)
            self.assertIs(first['pass'], True)
            self.assertRejected(second)
            self.assertEqual(child.signals, [signal.SIGTERM])
            self.assertEqual(len(child.waits), 1)


class HostLifecycleContract(unittest.TestCase):
    """Fully repinned test receipts, not native results or executable resources."""
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='helmut-v7-unit-host-')
        self.root = Path(self.temp.name).resolve()
        self.old_cases = C.CASES
        C.CASES = self.root / 'cases'
        C.CASES.mkdir()
        self.case = C.CASES / ('control-' + 'a' * 24); self.case.mkdir()
        self.frozen = write_json(self.root / 'PREPARED.SAFE.json', copy.deepcopy(PREPARED))
        self.selection = {
            'mode': 'lifecycle-only',
            'adoptionSchema': 'helmut-control-cache-lifecycle-only-root-adoption/1',
            'action': 'ROOT START POSTGREST LIFECYCLE ONLY',
            'installSQLPin': PREPARED['installSQLPin'],
            'expectedBodySHA256': '4e2b9015790312d0b05e781ba6ef9a62cb13462167c47b6c9a998f27cdfb9ae0',
            'authRPCCount': 0, 'nodeLaunchCount': 0,
            'postgrestConfigSHA256': EXPECTED_POLICY['configSHA256'],
            'postgrestShutdownPolicy': copy.deepcopy(EXPECTED_POLICY),
            'upstreamEvidencePin': PREPARED['upstreamEvidencePin']}
        self.stop = {'schema': 'helmut-owned-postgrest-stop/3', 'pass': True,
            'returnCode': -2, 'preStopReturnCode': None, 'knownPID': 4317, 'observedPID': 4317,
            'pins': pins(), 'signalRequested': 'SIGTERM', 'signalSent': True, 'reaped': True,
            'timedOut': False, 'killRequested': False, 'killSent': False,
            'errors': [], 'persistError': None, 'parentLogClosed': True,
            'logEOFProof': {'eofObserved': True, 'drainEnded': True, 'errors': [],
                           'overflow': False, 'versionSeen': True},
            'acceptedExpectedTranslation': True, 'returnCodeClassification': CLASSIFICATION,
            'shutdownPolicy': copy.deepcopy(EXPECTED_POLICY), 'unitFixtureNotNative': True}
        self.worker = {'pass': True, 'selection': copy.deepcopy(self.selection),
            'measurementMode': 'lifecycle-only', 'sourceUnchangedFullManifest': True,
            'allOwnedDatabaseChildrenClosed': True, 'catalogUnchangedAfterOperation': True,
            'authRPCCount': 0, 'nodeStarted': False, 'postgrestSocketReady': True,
            'postgrestVersionQualified': True, 'unitFixtureNotNative': True}
        self.actual = {'schema': 'helmut-control-cache-result/1', 'status': 'PASS',
            'preparedPin': self.frozen, 'measurementMode': 'lifecycle-only',
            'authRPCCount': 0, 'nodeStarted': False, 'sourceManifestSHA256': C.SOURCE_SHA,
            'selection': copy.deepcopy(self.selection),
            'kernelThroughLastOwnedExit': {'fullLastProcessExitCovered': True,
                'populatedSubgroups': [], 'memoryEvents': {'oom': 0, 'oom_kill': 0}},
            'nativeBudgetAfterLastExit': {'setupHelpersExited': True},
            'actualContainerClosure': {'exitCode': 0, 'allOwnedWorkloadExited': True},
            'unitFixtureNotNative': True}
        self.repin_all()

    def tearDown(self):
        C.CASES = self.old_cases
        self.temp.cleanup()

    def repin_worker_and_actual(self):
        self.worker_pin = write_json(self.case / 'WORKER_RESULT.SAFE.json', self.worker)
        self.actual['workerResultPin'] = self.worker_pin
        self.actual_pin = write_json(self.case / 'ACTUAL_RESULT.SAFE.json', self.actual)

    def repin_all(self):
        self.stop_host_pin = write_json(self.case / 'POSTGREST_STOP.SAFE.json', self.stop)
        self.worker['postgrestStopReceiptPin'] = {**self.stop_host_pin,
                                                'path': '/bench/POSTGREST_STOP.SAFE.json'}
        self.repin_worker_and_actual()

    def reject(self, item=None):
        with self.assertRaises(RuntimeError):
            C.lifecycle_proof(item if item is not None else self.actual_pin, self.frozen)

    def test_exact_worker_namespace_pin_translates_to_three_same_case_host_pins(self):
        expected = [self.actual_pin, self.worker_pin, self.stop_host_pin]
        self.assertEqual(C.lifecycle_proof(self.actual_pin, self.frozen), expected)
        self.assertEqual(C.lifecycle_file_pins(self.actual_pin, self.frozen), expected)
        self.assertTrue(all(Path(p['path']).parent == self.case for p in expected))
        self.assertEqual(self.worker['postgrestStopReceiptPin']['path'], '/bench/POSTGREST_STOP.SAFE.json')

    def test_wrong_result_basename_outside_case_and_result_symlink_are_rejected(self):
        wrong = write_json(self.case / 'OTHER.SAFE.json', self.actual)
        self.reject(wrong)
        outside = write_json(self.root / 'ACTUAL_RESULT.SAFE.json', self.actual)
        self.reject(outside)
        actual = self.case / 'ACTUAL_RESULT.SAFE.json'
        alias_target = self.case / 'real-data.json'; alias_target.write_bytes(actual.read_bytes())
        actual.unlink(); actual.symlink_to(alias_target)
        self.reject(self.actual_pin)

    def test_worker_pin_from_another_case_is_rejected_even_with_correct_bytes_and_hash(self):
        other = C.CASES / ('control-' + 'b' * 24); other.mkdir()
        self.actual['workerResultPin'] = write_json(other / 'WORKER_RESULT.SAFE.json', self.worker)
        self.actual_pin = write_json(self.case / 'ACTUAL_RESULT.SAFE.json', self.actual)
        self.reject()

    def test_only_exact_bench_basename_may_translate(self):
        for bad in ('/bench/OTHER.SAFE.json', '/bench/nested/POSTGREST_STOP.SAFE.json',
                    '/other/POSTGREST_STOP.SAFE.json', str(self.case / 'POSTGREST_STOP.SAFE.json')):
            with self.subTest(path=bad):
                self.worker['postgrestStopReceiptPin']['path'] = bad
                self.repin_worker_and_actual(); self.reject()

    def test_hash_drift_is_rejected_at_each_real_file_boundary(self):
        self.reject({**self.actual_pin, 'sha256': '0' * 64})
        self.actual['workerResultPin'] = {**self.worker_pin, 'sha256': '0' * 64}
        self.actual_pin = write_json(self.case / 'ACTUAL_RESULT.SAFE.json', self.actual)
        self.reject()
        self.worker['postgrestStopReceiptPin']['sha256'] = '0' * 64
        self.repin_worker_and_actual(); self.reject()

    def test_same_named_host_stop_symlink_cannot_escape_case(self):
        path = self.case / 'POSTGREST_STOP.SAFE.json'
        outside = self.root / 'same-byte-stop.json'; outside.write_bytes(path.read_bytes())
        path.unlink(); path.symlink_to(outside)
        self.reject()

    def test_different_prepared_or_selection_cannot_be_relabelled_pass(self):
        self.actual['preparedPin'] = {**self.frozen, 'sha256': '0' * 64}
        self.actual_pin = write_json(self.case / 'ACTUAL_RESULT.SAFE.json', self.actual)
        self.reject()
        self.actual['preparedPin'] = self.frozen
        self.worker['selection']['postgrestShutdownPolicy']['upstreamEvidenceSHA256'] = '0' * 64
        self.repin_worker_and_actual(); self.reject()

    def test_repinned_false_pass_receipts_fail_semantic_checks(self):
        baseline = copy.deepcopy(self.stop)
        changes = [('pass', False), ('returnCode', 143), ('acceptedExpectedTranslation', False),
                   ('returnCodeClassification', 'UNQUALIFIED'), ('schema', 'helmut-owned-postgrest-stop/2'),
                   ('signalRequested', 'SIGINT'), ('killSent', True), ('reaped', False),
                   ('persistError', 'FAKE persistence failure')]
        for key, value in changes:
            with self.subTest(field=key):
                self.stop = copy.deepcopy(baseline); self.stop[key] = value
                self.repin_all(); self.reject()
        self.stop = copy.deepcopy(baseline); self.stop['logEOFProof']['versionSeen'] = False
        self.repin_all(); self.reject()
        self.stop = copy.deepcopy(baseline); self.stop['shutdownPolicy']['upstreamEvidenceSHA256'] = '0' * 64
        self.repin_all(); self.reject()

    def test_repinned_worker_failure_or_incomplete_native_exit_cannot_be_pass(self):
        self.worker['pass'] = False; self.repin_worker_and_actual(); self.reject()
        self.worker['pass'] = True
        self.actual['kernelThroughLastOwnedExit']['memoryEvents']['oom'] = 1
        self.repin_worker_and_actual(); self.reject()
        self.actual['kernelThroughLastOwnedExit']['memoryEvents']['oom'] = 0
        self.actual['kernelThroughLastOwnedExit']['populatedSubgroups'] = ['FAKE POPULATED']
        self.repin_worker_and_actual(); self.reject()


def load_pinned_module(name, item):
    path = Path(item['path'])
    if not path.is_absolute() or path.resolve() != path or path.is_symlink():
        raise RuntimeError('noncanonical subject source')
    source = path.read_bytes()
    if len(source) != item['bytes'] or hashlib.sha256(source).hexdigest() != item['sha256']:
        raise RuntimeError('subject source pin drift')
    module = types.ModuleType(name); module.__file__ = str(path); module.__package__ = ''
    exec(compile(source, str(path), 'exec', dont_inherit=True), module.__dict__)
    return module


def main():
    global C, H, PREPARED
    parser = argparse.ArgumentParser(description=__doc__, add_help=False)
    parser.add_argument('--prepared', type=Path, default=Path(DEFAULT_PREPARED))
    parser.add_argument('--prepared-sha256', default=DEFAULT_SHA)
    parser.add_argument('--prepared-bytes', type=int, default=DEFAULT_BYTES)
    options, remainder = parser.parse_known_args()
    data = options.prepared.read_bytes()
    if len(data) != options.prepared_bytes or hashlib.sha256(data).hexdigest() != options.prepared_sha256:
        raise RuntimeError('explicit prepared freeze pin drift')
    PREPARED = json.loads(data)
    modules = {}
    for name, expected in MODULE_HASHES.items():
        items = [p for p in PREPARED['files'] if Path(p['path']).name == name]
        if len(items) != 1 or items[0]['sha256'] != expected:
            raise RuntimeError('not the independently targeted V7 subject source')
        modules[name] = load_pinned_module('unit_v7_' + name.replace('.', '_'), items[0])
    C, H = modules['common.py'], modules['postgrest_lifecycle.py']
    if H.ORIGINAL_SIGINT_POLICY != EXPECTED_POLICY:
        raise RuntimeError('public original-binary/upstream policy changed')
    result = unittest.main(argv=[sys.argv[0], *remainder], verbosity=2, exit=False).result
    return 0 if result.wasSuccessful() else 1


if __name__ == '__main__':
    raise SystemExit(main())
