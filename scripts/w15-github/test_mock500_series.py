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


A = load('mock500_after_stop')


class AfterStopChecks(unittest.TestCase):
    """Only synthetic roots and authenticated-API doubles; never the actual series."""
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='w15-after-stop-synthetic-')
        self.addCleanup(self.temp.cleanup); self.root = Path(self.temp.name)
        self.case = self.root / 'child'; self.case.mkdir(mode=0o700)
        for name in ('journal', 'reservations', 'terminals'):
            (self.root / name).mkdir(mode=0o700)
        self.put('journal/lock', {}, raw=b'')
        self.grant = dict(maximumAttempts=3, maximumPerRunUSD='0.05', maximumTotalUSD='0.15',
                          excludedNonces=[], grantId=str(uuid.uuid4()), receivedAtUTC='2026-11-03T22:00:00Z')
        self.put('OPERATOR_SERIES_GRANT.SAFE.json', self.grant); self.put('journal/GRANT.json', self.grant)
        self.put('INITIALIZED.SAFE.json', {'journalRoot': str(self.root / 'journal')})
        previous = S.digest(self.grant)
        for i, kind in enumerate(('RESERVE', 'STOP', 'NO_POST_CONTINUATION', 'RESERVE', 'STOP'), 1):
            body = {'reason': 'UNKNOWN'}
            if kind == 'RESERVE':
                ordinal = 1 if i == 1 else 2
                ticket = dict(ordinal=ordinal, nonce=str(uuid.uuid4()))
                body = {'ticket': ticket}
                self.put('reservations/%06d.json' % ordinal, dict(ordinal=ordinal, reservationSHA256=S.digest(ticket)))
            row = dict(sequence=i, kind=kind, body=body, previousSHA256=previous)
            self.put('journal/%06d.json' % i, row); previous = S.digest(row)
        for name in ('SERIES_STOP.SAFE.json', 'NO_POST_LATER_STOP.SAFE.json'):
            self.put(name, dict(reason='UNKNOWN', grantSHA256=S.digest(self.grant)))
        self.history = [dict(id=41818696152, head_sha=S.FIRST, event='workflow_dispatch',
            head_branch='synthetic', workflow_id=313506164, run_attempt=1, status='completed',
            conclusion='failure', created_at='2026-11-03T23:00:00Z', updated_at='2026-11-03T23:01:00Z')]
        self.baseline = dict(rootEntries=sorted(p.name for p in self.root.iterdir()), history=self.history,
            files=[dict(relativePath=name, bytes=len((self.root/name).read_bytes()),
                        sha256=A.hashlib.sha256((self.root/name).read_bytes()).hexdigest()) for name in sorted(A.PIN_NAMES)])
        self.original = {name: (self.root/name).read_bytes() for name in A.PIN_NAMES}
        self.binding = dict(runtimeCommit=A.RUNTIME, controlCommit='c'*40, nonce=str(uuid.uuid4()),
            casePath=str(self.case), mode=A.MODE, scope=A.SCOPE, authoritySHA256='a'*64,
            approvalSHA256=S.digest('fresh go'), requestSHA256=S.digest('fresh request'),
            originalBindingSHA256=S.digest('fresh original metadata'), sourceQualificationSHA256=S.digest('33d source'),
            controlQualificationSHA256=S.digest('new control CI and review'), reviewSHA256=S.digest('independent review'),
            issuedAtUTC='2026-11-04T00:00:00Z', expiresAtUTC='2026-11-04T01:00:00Z')
        self.authority = dict(schema=A.SCHEMA+'-authority', purpose='EXECUTE_ONE_FULL_MOCK_AFTER_STOP',
            actualOperatorInstruction='SYNTHETIC authenticated execution instruction, no real authority.',
            operatorObservedAtUTC='2026-11-03T23:59:00Z', seriesBaselineSHA256=S.digest(self.baseline),
            runtimeCommit=A.RUNTIME, controlCommit=self.binding['controlCommit'], nonce=self.binding['nonce'],
            casePath=str(self.case), approvalSHA256=self.binding['approvalSHA256'], requestSHA256=self.binding['requestSHA256'],
            scope=A.SCOPE, environment='helmut-ci-originals', ordinal=3, maximumAttempts=1, maximumLinkRounds=1,
            maximumPerRunUSD='0.05', maximumTotalUSD='0.15', maximumModelCalls=0,
            preservePriorStopsAndUnknown=True, automaticRetry=False, linkRefresh=False)
        self.binding['authoritySHA256'] = S.digest(self.authority)
        self.trusted_authority = S.digest(self.authority); self.now = NOW
        self.local_ok = True; self.remote_calls = []

    def put(self, name, value, raw=None):
        path = self.root/name
        path.write_bytes(S.canonical(value)+b'\n' if raw is None else raw); os.chmod(path, 0o600)

    def gate(self, **changes):
        def api(method, path):
            self.remote_calls.append((method, path)); return {'workflow_runs': self.history}
        options = dict(expected_root=str(self.root), baseline=self.baseline, authority=self.authority,
            binding=self.binding, authenticate=lambda value: S.digest(value) == self.trusted_authority,
            verify_before_launch=lambda binding, expected: A.authenticate_history(api, self.grant['receivedAtUTC'], expected),
            verify_local=lambda binding, now: self.local_ok,
            window_check=lambda now: W.validate_window('mock500', now), clock=lambda: self.now)
        options.update(changes)
        return A.AfterStop(self.root, **options)

    def blocked(self, action):
        with self.assertRaises(A.AfterStopRejected): action()

    def preserved(self):
        self.assertEqual(self.original, {name: (self.root/name).read_bytes() for name in self.original})

    def test_after_stop_full_order_only_one_post_and_old_evidence_byte_identical(self):
        gate = self.gate(); claim = gate.launch()
        self.assertEqual((claim['ordinal'], claim['maximumStorageUSD']), (3, '0.05'))
        self.blocked(gate.launch); self.blocked(lambda: gate.consume('POST'))
        self.assertTrue(gate.consume('LINKS')); self.blocked(lambda: gate.consume('LINKS'))
        self.assertTrue(gate.consume('POST')); self.blocked(lambda: gate.consume('POST'))
        self.assertEqual(len(self.remote_calls), 1)  # No GET after READY/fresh links.
        gate.close('UNKNOWN'); self.blocked(lambda: self.gate().consume('POST'))
        self.blocked(lambda: self.gate().launch()); self.preserved()

    def test_after_stop_development_forged_authority_and_wrong_bindings_fail_before_claim(self):
        for changes in ({'purpose': 'DEVELOP_ONLY'}, {'maximumAttempts': 2}, {'ordinal': 2},
                        {'maximumTotalUSD': '0.20'}, {'preservePriorStopsAndUnknown': False}):
            bad = dict(self.authority, **changes)
            binding = dict(self.binding, authoritySHA256=S.digest(bad))
            self.blocked(lambda: self.gate(authority=bad, binding=binding, authenticate=lambda _:True).launch())
        self.blocked(lambda: self.gate(authenticate=lambda _:1).launch())
        self.blocked(lambda: self.gate(authenticate=lambda _:False).launch())
        for changes in ({'runtimeCommit': S.FIRST}, {'controlCommit': A.RUNTIME}, {'mode': 'prepare-only'},
                        {'casePath': str(self.root/'absent')}, {'nonce': self.grant['grantId']}):
            self.blocked(lambda: self.gate(binding=dict(self.binding, **changes)).launch())
        self.assertFalse(any((self.root/name).exists() for name in A.FILES)); self.preserved()

    def test_after_stop_changed_missing_extra_state_and_different_root_rejected(self):
        self.blocked(lambda: self.gate(expected_root=str(self.root/'other')).launch())
        for name in sorted(A.PIN_NAMES):
            path = self.root/name; original = path.read_bytes()
            path.write_bytes(original+b' '); self.blocked(lambda: self.gate().launch())
            path.unlink(); self.blocked(lambda: self.gate().launch())
            self.put(name, None, raw=original)
        for name in ('journal/000006.json', 'reservations/000003.json', 'terminals/000001.json', 'NEW_STOP.SAFE.json'):
            self.put(name, {}); self.blocked(lambda: self.gate().launch()); (self.root/name).unlink()
        self.preserved()

    def test_after_stop_authenticated_complete_history_blocks_unknown_active_and_changed_runs(self):
        expected = json.loads(S.canonical(self.baseline))
        for rows in ([], [dict(self.history[0], status='in_progress')], [dict(self.history[0], head_sha='d'*40)],
                     self.history + [dict(self.history[0], id=41818696153)]):
            self.history = rows
            self.blocked(lambda: self.gate(baseline=expected).launch())
        self.assertFalse((self.root/A.FILES[0]).exists())

    def test_after_stop_state_go_and_local_qualification_rechecked_between_ready_and_post(self):
        gate = self.gate(); gate.launch(); gate.consume('LINKS')
        self.now = datetime(2026, 11, 4, 1, 0, tzinfo=timezone.utc)
        self.blocked(lambda: gate.consume('POST')); self.now = NOW
        self.local_ok = False; self.blocked(lambda: gate.consume('POST')); self.local_ok = True
        self.blocked(lambda: self.gate(binding=dict(self.binding, requestSHA256='0'*64)).consume('POST'))
        self.put('SERIES_STOP.SAFE.json', {}); self.blocked(lambda: gate.consume('POST'))
        # Closing failure must still work after expiry or evidence drift; never permits another action.
        gate.close('UNKNOWN'); self.blocked(lambda: gate.consume('POST'))

    def test_after_stop_race_has_one_global_claim(self):
        ctx = multiprocessing.get_context('fork'); barrier, queue = ctx.Barrier(2), ctx.Queue()
        def child():
            barrier.wait(timeout=5)
            try: self.gate().launch(); queue.put('claimed')
            except A.AfterStopRejected: queue.put('blocked')
        processes = [ctx.Process(target=child) for _ in range(2)]
        try:
            for process in processes: process.start()
            for process in processes: process.join(timeout=10)
            self.assertTrue(all(process.exitcode == 0 for process in processes))
            self.assertEqual(sorted(queue.get(timeout=2) for _ in processes), ['blocked', 'claimed'])
            self.blocked(lambda: self.gate().consume('LINKS'))  # Claim owner exited: no resumed launch.
            self.blocked(lambda: self.gate().launch()); self.preserved()
        finally:
            for process in processes:
                if process.is_alive(): process.terminate(); process.join()
            queue.close(); queue.join_thread()

    def test_after_stop_durability_failure_and_no_post_never_refund(self):
        with patch.object(S.os, 'fsync', side_effect=OSError('synthetic fsync failure')):
            self.blocked(lambda: self.gate().launch())
        self.assertTrue((self.root/A.SPENT).exists()); self.blocked(lambda: self.gate().launch())
        self.blocked(lambda: self.gate().consume('LINKS')); self.preserved()

    def test_after_stop_terminal_requires_actual_authentication_and_never_reopens(self):
        gate = self.gate(); claim = gate.launch(); gate.consume('LINKS'); gate.consume('POST')
        proof = dict(status='PASS', runtimeCommit=A.RUNTIME, nonce=self.binding['nonce'], claimSHA256=S.digest(claim))
        self.blocked(lambda: gate.close('PASS', proof=proof))
        self.blocked(lambda: gate.close('PASS', proof=proof, verify_terminal=lambda _:False))
        self.assertTrue(gate.close('PASS', proof=proof, verify_terminal=lambda observed: observed == proof))
        self.blocked(lambda: gate.launch()); self.blocked(lambda: gate.consume('POST')); self.preserved()


T = load('mock500_standing')


class StandingChecks(unittest.TestCase):
    def setUp(self):
        self.f = AfterStopChecks(); self.f.setUp(); self.addCleanup(self.f.doCleanups)
        self.authority = dict(schema=T.SCHEMA+'-grant', purpose='SEQUENTIAL_FULL_MOCK_UNTIL_FIRST_VERIFIED_PASS',
            actualOperatorInstruction='SYNTHETIC standing instruction; no actual execution authority.',
            operatorObservedAtUTC='2026-11-03T23:59:00Z', legacyBaselineSHA256=S.digest(self.f.baseline),
            firstRuntimeCommit=A.RUNTIME, maximumActualUSD='0.00', maximumModelCalls=0,
            productionAllowed=False, newPaidResourcesAllowed=False, stopAfterFirstPASS=True)
        self.authority_pin = S.digest(self.authority)
        self.binding = dict(self.f.binding, authoritySHA256=self.authority_pin, costProofSHA256=S.digest('authenticated free quota'),
            priorTerminalSHA256=None, causeSHA256=None, fixSHA256=None, targetedTestsSHA256=S.digest('exact-head focused tests'))
        self.cost_ok = self.admission_ok = True; self.terminals = set(); self.remote_checks = 0

    def gate(self, **changes):
        def before(binding, prior):
            self.remote_checks += 1
            return self.admission_ok
        options = dict(expected_root=str(self.f.root), baseline=self.f.baseline, authority=self.authority,
            binding=self.binding, authenticate=lambda value:S.digest(value)==self.authority_pin,
            verify_before_launch=before, verify_local=lambda binding,now:self.f.local_ok,
            verify_cost=lambda binding,now:self.cost_ok,
            verify_terminal=lambda proof,claim:S.digest(proof) in self.terminals,
            window_check=lambda now:W.validate_window('mock500',now), clock=lambda:self.f.now)
        options.update(changes); return T.Standing(self.f.root,**options)

    def initialized(self):
        gate=self.gate();gate.initialize();return gate

    def proof(self,claim,**changes):
        value=dict(status='FAIL',dispatchOutcome='ACCEPTED',claimSHA256=S.digest(claim),
            runtimeCommit=claim['binding']['runtimeCommit'],nonce=claim['binding']['nonce'],
            processesStopped=True,originalIntegrityKnown=True,cleanupKnown=True,nativeZeroKnown=True,
            allEightCleanupPassed=True,securityViolation=False,actualPaidUSD='0.00',
            evidenceSHA256=S.digest(['actual synthetic terminal',claim]),fullMock500Accepted=False)
        value.update(changes);self.terminals.add(S.digest(value));return value

    def next_binding(self,proof,index,**changes):
        self.binding=dict(self.binding,runtimeCommit=('%040x'%index),nonce=str(uuid.uuid4()),
            priorTerminalSHA256=S.digest(proof),causeSHA256=S.digest(['actual cause',index]),
            fixSHA256=S.digest(['concrete repair',index]),targetedTestsSHA256=S.digest(['targeted repair check',index]),
            sourceQualificationSHA256=S.digest(['fresh source',index]),originalBindingSHA256=S.digest(['fresh original binding',index]))
        self.binding.update(changes)

    def blocked(self,callback):
        with self.assertRaises(T.A.AfterStopRejected): callback()

    def test_more_than_three_sequential_safe_repairs_then_actual_pass_ends_grant(self):
        gate=self.initialized()
        for index in range(1,6):
            claim=gate.launch();gate.consume('LINKS');gate.consume('POST')
            proof=self.proof(claim,**({'status':'PASS','fullMock500Accepted':True} if index==5 else {}))
            gate.complete(proof)
            self.next_binding(proof,index);gate=self.gate()
        self.blocked(gate.launch);self.assertEqual(self.remote_checks,5);self.f.preserved()
        self.assertEqual(len(list((self.f.root/T.LEDGER).iterdir())),20)

    def test_functional_fail_needs_runtime_fix_control_only_repair_requires_proved_no_post(self):
        gate=self.initialized();claim=gate.launch();gate.consume('LINKS');gate.consume('POST')
        proof=self.proof(claim);gate.complete(proof)
        self.next_binding(proof,1,runtimeCommit=A.RUNTIME,controlCommit='d'*40)
        self.blocked(lambda:self.gate().launch())
        self.binding['runtimeCommit']='1'*40;self.admission_ok=False
        self.blocked(lambda:self.gate().launch());self.admission_ok=True
        gate=self.gate();claim=gate.launch()
        # A real NOT_DISPATCHED finding is authenticated, including local quiescence.
        proof=self.proof(claim,dispatchOutcome='NOT_DISPATCHED');gate.complete(proof)
        self.next_binding(proof,2,runtimeCommit='1'*40,controlCommit='e'*40)
        self.gate().launch();self.f.preserved()

    def test_zero_cost_authentication_and_freshness_are_required_before_every_effect(self):
        gate=self.initialized();self.cost_ok=False;self.blocked(gate.launch)
        self.assertEqual(list((self.f.root/T.LEDGER).iterdir()),[])
        self.cost_ok=1;self.blocked(gate.launch);self.cost_ok=True
        gate=self.gate();gate.launch();self.cost_ok=False;self.blocked(lambda:gate.consume('LINKS'))
        self.cost_ok=True;gate.consume('LINKS');self.cost_ok=False;self.blocked(lambda:gate.consume('POST'))
        self.cost_ok=True;self.f.now=datetime(2026,11,4,1,0,tzinfo=timezone.utc)
        self.blocked(lambda:gate.consume('POST'));self.assertEqual(self.remote_checks,1);self.f.preserved()

    def test_holds_and_fake_terminal_flags_never_resume_without_actual_safe_evidence(self):
        gate=self.initialized();claim=gate.launch();gate.consume('LINKS');gate.consume('POST');gate.hold('SECURITY_VIOLATION')
        self.blocked(gate.launch);self.blocked(lambda:gate.consume('POST'))
        proof=self.proof(claim);self.terminals.clear();self.blocked(lambda:gate.complete(proof))
        no_post=self.proof(claim,dispatchOutcome='NOT_DISPATCHED')
        self.blocked(lambda:gate.complete(no_post))  # An existing POST phase is never a no-post shortcut.
        for change in ({'nativeZeroKnown':False},{'allEightCleanupPassed':False},{'actualPaidUSD':'0.01'},
                       {'originalIntegrityKnown':False},{'securityViolation':True},{'status':'UNKNOWN'}):
            bad=dict(proof,**change);self.terminals.add(S.digest(bad));self.blocked(lambda:gate.complete(bad))
        self.terminals.add(S.digest(proof));gate.complete(proof)
        rows=[json.loads(p.read_bytes()) for p in sorted((self.f.root/T.LEDGER).iterdir())]
        self.assertEqual(rows[-2]['kind'],'HOLD');self.assertEqual(rows[-2]['body']['reason'],'SECURITY_VIOLATION')
        self.next_binding(proof,1);self.gate().launch();self.f.preserved()

    def test_crash_partial_write_missing_anchor_and_reentry_do_not_create_another_attempt(self):
        gate=self.initialized()
        with patch.object(S.os,'fsync',side_effect=OSError('synthetic durability failure')):
            self.blocked(gate.launch)
        self.assertEqual(len(list((self.f.root/T.ANCHORS).iterdir())),1)
        self.assertEqual(len(list((self.f.root/T.LEDGER).iterdir())),0)
        self.blocked(lambda:self.gate().launch());self.blocked(lambda:self.gate().initialize());self.f.preserved()

    def test_concurrent_claim_and_owner_death_block_overlap_and_restart(self):
        self.initialized();ctx=multiprocessing.get_context('fork');barrier,queue=ctx.Barrier(2),ctx.Queue()
        def child():
            barrier.wait(timeout=5)
            try:self.gate().launch();queue.put('claimed')
            except T.A.AfterStopRejected:queue.put('blocked')
        processes=[ctx.Process(target=child) for _ in range(2)]
        try:
            for process in processes:process.start()
            for process in processes:process.join(timeout=10)
            self.assertTrue(all(p.exitcode==0 for p in processes))
            self.assertEqual(sorted(queue.get(timeout=2) for _ in processes),['blocked','claimed'])
            self.blocked(lambda:self.gate().launch());self.blocked(lambda:self.gate().consume('LINKS'))
            self.f.preserved()
        finally:
            for process in processes:
                if process.is_alive():process.terminate();process.join()
            queue.close();queue.join_thread()

    def test_development_grant_old_caps_extra_state_and_stale_binding_rejected(self):
        for changes in ({'purpose':'DEVELOP_ONLY'},{'maximumAttempts':3},{'maximumActualUSD':'0.15'},
                        {'newPaidResourcesAllowed':True},{'stopAfterFirstPASS':False}):
            self.blocked(lambda:self.gate(authority=dict(self.authority,**changes),authenticate=lambda _:True).initialize())
        self.initialized();self.f.put('NEW_STOP.SAFE.json',{});self.blocked(lambda:self.gate().launch())
        (self.f.root/'NEW_STOP.SAFE.json').unlink();gate=self.gate();gate.launch();gate.consume('LINKS')
        self.blocked(lambda:self.gate(binding=dict(self.binding,requestSHA256='0'*64)).consume('POST'))
        self.f.preserved()


if __name__ == '__main__':
    unittest.main()
