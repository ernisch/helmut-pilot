"""Small synthetic admission ledger checks; no links, Original program, DB or network."""
import sys
sys.dont_write_bytecode = True
from datetime import datetime, timezone
import importlib.util
import json
import multiprocessing
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import uuid


def load(name):
    spec = importlib.util.spec_from_file_location('series_test_' + name, Path(__file__).with_name(name + '.py'))
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


S, W = load('mock500_series'), load('functional_contract')
NOW = datetime(2026, 11, 4, 0, 1, tzinfo=timezone.utc)
SECOND, THIRD, FOURTH = 'b' * 40, 'c' * 40, 'd' * 40


class SeriesChecks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='w15-series-synthetic-')
        self.addCleanup(self.temp.cleanup); self.root = Path(self.temp.name)
        os.chmod(self.root, 0o700)
        self.grant = dict(schema=S.SCHEMA + '-grant', grantId=str(uuid.uuid4()), operatorAuthorized=True,
            receivedAtUTC='2026-11-03T22:00:00Z', firstCommit=S.FIRST, firstDateUTC='2026-11-01',
            lastDateUTC='2026-11-07', maximumAttempts=3, maximumPerRunUSD='0.05', maximumTotalUSD='0.15',
            processingSeconds=10800, completionSeconds=12600, excludedNonces=[str(uuid.uuid4())])
        self.pin = S.digest(self.grant); self.admissions, self.terminals = set(), set()
        self.initialized = set()
        self.now = NOW
        self.descendants = {(S.FIRST, SECOND), (SECOND, THIRD), (THIRD, FOURTH)}

    def open(self, **changes):
        options = dict(window_check=lambda now: W.validate_window('mock500', now),
            is_descendant=lambda before, after: (before, after) in self.descendants,
            verify_admission=lambda ticket, gates: S.digest(gates) in self.admissions,
            verify_terminal=lambda ticket, proof: S.digest(proof) in self.terminals,
            clock=lambda: self.now, initialize=self.root not in self.initialized)
        options.update(changes)
        result = S.Series(self.root, self.grant, self.pin, **options)
        self.initialized.add(self.root); return result

    def gates(self, target=S.FIRST, prior=None, proof=None):
        result = dict(targetCommit=target, baseCommit=prior['targetCommit'] if prior else None,
            priorTerminalSHA256=S.digest(proof) if proof else None,
            causeSHA256=S.digest('concrete original failure') if prior else None,
            fixSHA256=S.digest('minimal independently reviewed repair') if prior else None,
            targetedTestsSHA256=S.digest(['targeted test evidence', target]), ciRunId=41707992564,
            ciProofSHA256=S.digest(['actual successful CI', target]),
            independentReviewSHA256=S.digest(['independent exact-head review', target]),
            sourceQualificationSHA256=S.digest(['exact source closure', target]))
        self.admissions.add(S.digest(result)); return result

    def proof(self, ticket, **changes):
        result = dict(status='FAIL', runId='41710000000', jobId='126200000000',
            exactCommit=ticket['targetCommit'], nonce=ticket['nonce'], reservationSHA256=S.digest(ticket),
            receiptSHA256=S.digest(['authenticated receipt', ticket['ordinal']]),
            authenticatedInputsSHA256=S.digest(['actual job inputs', ticket['nonce']]),
            cleanupKnown=True, processesStopped=True, originalIntegrityKnown=True,
            securityViolation=False, dispatchOutcome='ACCEPTED')
        result.update(changes); self.terminals.add(S.digest(result)); return result

    def reserve(self, series=None, target=S.FIRST, prior=None, proof=None, nonce=None):
        return (series or self.open()).reserve(target, nonce or str(uuid.uuid4()), self.gates(target, prior, proof))

    def assertBlocked(self, callback):
        with self.assertRaises(S.SeriesRejected) as caught:
            callback()
        self.assertEqual(str(caught.exception), 'MOCK500_SERIES_ADMISSION_REJECTED')

    def test_three_worst_case_reservations_exhaust_budget_and_fourth_is_denied(self):
        series = self.open(); prior = proof = None
        for ordinal, target in enumerate((S.FIRST, SECOND, THIRD), 1):
            ticket = self.reserve(series, target, prior, proof)
            self.assertEqual(ticket['ordinal'], ordinal)
            self.assertEqual(ticket['maximumStorageUSD'], '0.05')
            self.assertTrue(self.open().require_active(ticket))
            proof = self.proof(ticket); series.complete(ticket, proof); prior = ticket
            self.assertBlocked(lambda: self.open().require_active(ticket))
        self.assertBlocked(lambda: self.reserve(target=FOURTH, prior=prior, proof=proof))
        self.assertEqual(len(list(self.root.glob('[0-9]*.json'))), 6)

    def test_reserved_attempt_survives_restart_and_is_never_refunded(self):
        ticket = self.reserve()
        self.assertTrue(self.open().require_active(ticket))
        self.assertBlocked(lambda: self.reserve())
        self.assertBlocked(lambda: self.open().require_active(dict(ticket, nonce=str(uuid.uuid4()))))
        self.assertEqual(len(list(self.root.glob('[0-9]*.json'))), 1)

    def test_initialization_is_explicit_exclusive_and_missing_grant_does_not_restart(self):
        self.assertBlocked(lambda: self.open(initialize=False))
        self.open(initialize=True)
        self.assertBlocked(lambda: self.open(initialize=True))
        (self.root / 'GRANT.json').unlink()
        self.assertBlocked(self.open)

    def test_processes_racing_can_reserve_only_one_attempt(self):
        series = self.open(); gates = self.gates()
        ctx = multiprocessing.get_context('fork'); barrier, queue = ctx.Barrier(2), ctx.Queue()
        def child():
            barrier.wait(timeout=5)
            try:
                series.reserve(S.FIRST, str(uuid.uuid4()), gates); queue.put('reserved')
            except S.SeriesRejected:
                queue.put('blocked')
        processes = [ctx.Process(target=child) for _ in range(2)]
        try:
            for process in processes: process.start()
            for process in processes: process.join(timeout=10)
            self.assertTrue(all(process.exitcode == 0 for process in processes))
            self.assertEqual(sorted(queue.get(timeout=2) for _ in processes), ['blocked', 'reserved'])
        finally:
            for process in processes:
                if process.is_alive(): process.terminate(); process.join()
            queue.close(); queue.join_thread()

    def test_pass_unknown_security_and_unknown_safety_permanently_stop(self):
        cases = [dict(status='PASS'), dict(status='UNKNOWN', runId=None, jobId=None),
            dict(securityViolation=True), dict(cleanupKnown=False), dict(processesStopped=False),
            dict(originalIntegrityKnown=False), dict(dispatchOutcome='UNKNOWN')]
        for index, changes in enumerate(cases):
            with self.subTest(changes=changes):
                outer = self.root; self.root = outer / str(index); self.root.mkdir(mode=0o700)
                try:
                    series = self.open(); ticket = self.reserve(series); proof = self.proof(ticket, **changes)
                    series.complete(ticket, proof)
                    self.assertBlocked(lambda: self.reserve(target=SECOND, prior=ticket, proof=proof))
                    self.assertBlocked(lambda: series.complete(ticket, self.proof(ticket)))
                    self.assertBlocked(lambda: self.open().require_active(ticket))
                finally: self.root = outer

    def test_first_head_descendant_identity_nonce_and_prior_proof_are_bound(self):
        series = self.open(); self.assertBlocked(lambda: self.reserve(series, SECOND))
        for nonce in ('not-a-uuid', str(uuid.uuid1()), self.grant['grantId']):
            self.assertBlocked(lambda: self.reserve(series, nonce=nonce))
        ticket = self.reserve(series); proof = self.proof(ticket); series.complete(ticket, proof)
        for target, nonce in [(S.FIRST, str(uuid.uuid4())), (SECOND, ticket['nonce']),
                              (SECOND, self.grant['excludedNonces'][0]), (FOURTH, str(uuid.uuid4()))]:
            self.assertBlocked(lambda: self.reserve(series, target, ticket, proof, nonce))
        gates = self.gates(SECOND, ticket, proof); gates['priorTerminalSHA256'] = '0' * 64
        self.admissions.add(S.digest(gates))
        self.assertBlocked(lambda: series.reserve(SECOND, str(uuid.uuid4()), gates))

    def test_trusted_verifiers_and_terminal_bindings_cannot_be_replaced_by_json_flags(self):
        series = self.open(); gates = self.gates(); self.admissions.clear()
        self.assertBlocked(lambda: series.reserve(S.FIRST, str(uuid.uuid4()), gates))
        ticket = self.reserve(series); proof = self.proof(ticket); self.terminals.clear()
        self.assertBlocked(lambda: series.complete(ticket, proof))
        self.terminals.add(S.digest(proof))
        for key, value in [('nonce', str(uuid.uuid4())), ('exactCommit', SECOND),
                           ('reservationSHA256', '0' * 64), ('cleanupKnown', 'UNKNOWN')]:
            bad = dict(proof, **{key: value}); self.terminals.add(S.digest(bad))
            self.assertBlocked(lambda: series.complete(ticket, bad))
        series.complete(ticket, proof)

    def test_modified_grant_journal_gap_tamper_and_permissions_fail_closed(self):
        series = self.open(); ticket = self.reserve(series)
        grant_path = self.root / 'GRANT.json'; original = grant_path.read_bytes()
        grant_path.write_bytes(S.canonical(dict(self.grant, maximumAttempts=4)) + b'\n')
        self.assertBlocked(lambda: series.require_active(ticket)); grant_path.write_bytes(original)
        event = self.root / '000001.json'; value = json.loads(event.read_bytes())
        value['body']['ticket']['nonce'] = str(uuid.uuid4())
        event.write_bytes(S.canonical(value) + b'\n')
        self.assertBlocked(lambda: series.require_active(ticket))
        event.rename(self.root / '000002.json'); self.assertBlocked(self.open)
        os.chmod(self.root, 0o755); self.assertBlocked(self.open); os.chmod(self.root, 0o700)

    def test_actual_window_checker_and_grant_received_time_gate_without_consuming(self):
        series = self.open()
        for now in [datetime(2026, 11, 3, 20, 53, tzinfo=timezone.utc),
                    datetime(2026, 11, 4, 21, tzinfo=timezone.utc),
                    datetime(2026, 11, 8, 0, tzinfo=timezone.utc)]:
            self.now = now; self.assertBlocked(lambda: self.reserve(series))
        self.assertFalse(list(self.root.glob('[0-9]*.json')))
        self.now = NOW; self.reserve(series)

    def test_explicit_stop_and_durability_failure_never_permit_another_reservation(self):
        series = self.open(); series.stop('SECURITY_VIOLATION')
        self.assertBlocked(lambda: self.reserve(series)); self.assertBlocked(lambda: self.open().stop('UNKNOWN'))
        other = self.root / 'durability'; other.mkdir(mode=0o700); self.root = other
        series = self.open()
        with patch.object(S.os, 'fsync', side_effect=OSError('FICTIONAL_PRIVATE_PATH_NOT_PUBLIC')):
            self.assertBlocked(lambda: self.reserve(series))
        self.assertBlocked(lambda: self.reserve(self.open()))


if __name__ == '__main__':
    unittest.main()
