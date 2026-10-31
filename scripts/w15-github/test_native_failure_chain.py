"""Fictional first-error frames through real bounded pipes; no databases or originals."""
import sys
sys.dont_write_bytecode = True
import copy
import importlib.util
import json
import multiprocessing
import os
from pathlib import Path
import subprocess
import time
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch


def load(name):
    spec = importlib.util.spec_from_file_location('native_chain_' + name, Path(__file__).with_name(name + '.py'))
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module); return module


R, W, F = load('runner_start'), load('restore_workflow'), load('test_runner_diagnostics')
D = R.D
CANARY = 'fictional-private-value-that-even-matches-the-old-regex'


def native():
    return {'schema': 'helmut-w15-native-end500-failure/1', 'stage': 'auth-read', 'kind': 'storage-http-error',
        'code': 'UNKNOWN', 'causeCode': 'UNKNOWN', 'httpStatus': 403, 'timeoutMs': 'UNKNOWN', 'check': 'UNKNOWN',
        'acknowledgedCAS': 0, 'acknowledgedCASKind': 'CONFIRMED_LOWER_BOUND', 'writeOutcome': 'UNKNOWN',
        'requiredAction': 'INSPECT_STORAGE_PERMISSION_OR_RPC'}


def frame():
    return {'kind': 'native-failure', 'failure': native()}


class NativeFailureChecks(unittest.TestCase):
    def monitor(self, packets, *, guard=None, close_sender=False, exitcode=1, close_failure=False):
        receiver, sender = multiprocessing.Pipe(duplex=False)
        self.addCleanup(receiver.close)
        if not close_sender: self.addCleanup(sender.close)
        for packet in packets: sender.send_bytes(R._encode(packet, R.MAX_RESULT))
        if not close_sender:
            # Model the fork's writer; the supervisor closes its own copy.
            worker_writer = os.dup(sender.fileno()); self.addCleanup(os.close, worker_writer)
        if close_sender: sender.close()
        if close_failure:
            receiver = Mock(wraps=receiver); receiver.close.side_effect = RuntimeError(CANARY)
        state = {}
        with self.assertRaises(R.RunnerStartError) as caught:
            R._monitor_child(F.Child(alive=guard is not None, exitcode=exitcode), receiver, sender,
                guard or Mock(), time.monotonic()+5, native_failure=state)
        return caught.exception, state

    def test_exception_and_both_public_ipc_boundaries_keep_closed_first_error(self):
        error = W.WorkflowRejected('end500', native_failure=native())
        outer = R._worker_failure(error, 'WORKER_RESULT_REJECTED')
        restored = R._response_error(R._failure_packet(outer))
        public = W._safe_failure(restored)
        self.assertEqual(public['runner']['nativeFailure'], native())
        self.assertEqual(public['worker']['phase'], 'end500')
        self.assertEqual(W._safe_failure(error)['runner']['nativeFailure'], native())

    def test_actual_prepared_node_error_reaches_watch_pipe_supervisor_and_public_projection(self):
        # Only public application files and a deliberately missing fictional
        # state directory. No database, original input or 500-operation run.
        prepared = load('test_end500_prepared_initialization')
        fixture = prepared.PreparedInitializationChecks(); fixture.setUp()
        self.addCleanup(fixture.doCleanups)
        source = fixture.prep / 'app/scripts/synthetik-500-w15-memory-forward.js'
        raw = source.read_text(); marker = 'const BASE = "/tmp/w15-memory-atomic-20261028d"'
        self.assertEqual(raw.count(marker), 1)
        source.write_text(raw.replace(marker, 'const BASE = ' + json.dumps(str(fixture.root / CANARY))))
        child = subprocess.run(['node','--require',str(fixture.prep/'app/scripts/lokaler-netzschutz.js'),str(source),'run'],
            capture_output=True,timeout=15,env={**os.environ,'HELMUT_SOURCE_MODE':'off','HELMUT_STORAGE_BACKEND':'local'})
        self.assertEqual(child.returncode, 1)
        lines = child.stdout.splitlines(); self.assertEqual(len(lines), 1)
        receiver, sender = multiprocessing.Pipe(duplex=False)
        self.addCleanup(receiver.close); self.addCleanup(sender.close)
        watch = SimpleNamespace(native_failure=None,cas_records=[],first_failure=Mock(),
            common_resources=SimpleNamespace(native_failure_observer=R._native_failure_reporter(sender)))
        with patch.object(prepared.F.M, 'save'):
            prepared.F.Watch.observe_line(watch, lines[0], 'run')
        watch.first_failure.assert_not_called()
        final = R._worker_failure(W.WorkflowRejected('end500', native_failure=watch.native_failure), 'WORKER_RESULT_REJECTED')
        sender.send_bytes(R._encode(R._failure_packet(final), R.MAX_RESULT))
        with self.assertRaises(R.RunnerStartError) as caught:
            R._monitor_child(F.Child(alive=False),receiver,sender,Mock(),time.monotonic()+5,native_failure={})
        public = W._safe_failure(caught.exception)
        self.assertEqual(public['runner']['nativeFailure'], watch.native_failure)
        self.assertEqual(public['runner']['nativeFailure']['stage'], 'auth-fixture')
        self.assertEqual(public['runner']['nativeFailure']['acknowledgedCAS'], 'UNKNOWN')
        self.assertEqual(public['cleanup']['workerExited'], 'PASS')
        self.assertNotIn(CANARY, json.dumps(public))

    def test_early_error_survives_worker_signal_without_final_report(self):
        error, state = self.monitor([frame()], close_sender=True, exitcode=-9)
        self.assertEqual(state['value'], native())
        self.assertEqual(error.runner['reason'], 'WORKER_REPORTED_FAILURE')
        self.assertEqual(error.runner['secondaryReason'], 'WORKER_IPC_EOF')
        self.assertEqual(error.runner['nativeFailure'], native())
        self.assertEqual(error.runner['workerExitCode'], -9)
        self.assertEqual(error.cleanup['workerExited'], 'PASS')
        self.assertEqual(error.cleanup['parentEmpty'], 'UNKNOWN')

    def test_first_frame_survives_resource_rejection_and_cleanup_close_failure(self):
        memory = {'configuredLimitBytes':4999999488,'kernelLifetimePeakBytes':3100000000,'currentBytes':2900000000,
            'swapMaximumBytes':0,'swapCurrentBytes':0,'lastReadbackValid':False,
            'events':{'max':0,'oom':0,'oom_kill':0,'oom_group_kill':0}}
        guard = Mock(side_effect=R.RunnerStartError('worker', runner={'reason':'PARENT_READBACK_REJECTED',
            'memory':memory,'memorySource':'CURRENT_REJECTED_READBACK'}))
        error, _ = self.monitor([frame()], guard=guard, close_failure=True)
        self.assertEqual(error.runner['nativeFailure'], native())
        self.assertEqual(error.runner['secondaryReason'], 'PARENT_READBACK_REJECTED')
        self.assertEqual(error.runner['memory'], memory)
        self.assertEqual(error.runner['memorySource'], 'CURRENT_REJECTED_READBACK')
        self.assertEqual(error.cleanup['workerIPCClosed'], 'UNKNOWN')
        self.assertNotIn(CANARY, json.dumps(error.safe_failure))

    def test_duplicate_or_malformed_later_frame_cannot_replace_first(self):
        changed = frame(); changed['failure']['stage'] = 'journal-close'
        malformed = frame(); malformed['failure']['check'] = CANARY
        for later in (changed, malformed):
            with self.subTest(later=later):
                error, _ = self.monitor([frame(), later])
                self.assertEqual(error.runner['nativeFailure'], native())
                self.assertEqual(error.runner['secondaryReason'], 'WORKER_IPC_REJECTED')
                self.assertNotIn(CANARY, json.dumps(error.safe_failure))

    def test_later_final_error_or_success_cannot_erase_early_failure(self):
        for later in ({'ok': False, 'phase':'worker', 'workerPhase':'backup-export'}, {'ok':True, 'result':{}}):
            with self.subTest(later=later):
                error, _ = self.monitor([frame(), later], exitcode=0)
                self.assertEqual(error.worker_phase, 'end500')
                self.assertEqual(error.runner['nativeFailure'], native())

    def test_no_new_frame_is_accepted_on_unbound_existing_mock_channel(self):
        receiver, sender = multiprocessing.Pipe(duplex=False)
        self.addCleanup(receiver.close); self.addCleanup(sender.close)
        sender.send_bytes(R._encode(frame()))
        with self.assertRaises(R.RunnerStartError) as caught:
            R._read_worker_response(receiver, time.monotonic()+2)
        self.assertEqual(caught.exception.runner['reason'], 'WORKER_IPC_REJECTED')

    def test_one_report_only_and_bounded_immutable_scalar_payload(self):
        sender = Mock(); observe = R._native_failure_reporter(sender)
        value = native(); observe(value); value['stage'] = 'journal-close'
        encoded = sender.send_bytes.call_args.args[0]
        self.assertLessEqual(len(encoded), 1024)
        self.assertEqual(json.loads(encoded)['failure'], native())
        with self.assertRaises(R.RunnerStartError): observe(native())
        sender.send_bytes.assert_called_once()

    def test_private_or_invalid_optional_native_detail_preserves_other_diagnostics(self):
        base = {'reason':'WORKER_REPORTED_FAILURE','workerExitCode':1}
        for key, value in (('stage',CANARY),('kind',CANARY),('code',CANARY),('causeCode',CANARY),
                ('httpStatus',True),('timeoutMs',20001),('acknowledgedCAS',501),('check',CANARY),
                ('requiredAction',CANARY),('extra',CANARY)):
            bad = {**native(), key:value}
            with self.subTest(key=key):
                self.assertIsNone(D.native_failure(bad))
                self.assertEqual(D.runner({**base,'nativeFailure':bad}, lambda _:None), base)
        unknown = native(); unknown.update(acknowledgedCAS='UNKNOWN',acknowledgedCASKind='UNKNOWN')
        self.assertEqual(D.native_failure(unknown), unknown)
        self.assertLess(len(R._encode(R._failure_packet(R.RunnerStartError('worker','end500',
            runner={**base,'nativeFailure':native()})), R.MAX_RESULT)), R.MAX_RESULT)


if __name__ == '__main__': unittest.main()
