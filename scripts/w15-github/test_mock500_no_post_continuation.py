"""Synthetic append-only continuation checks; no actual series, network or Original data."""
import sys
sys.dont_write_bytecode = True
import importlib.util
import json
from pathlib import Path
import unittest
import uuid

spec = importlib.util.spec_from_file_location('legacy_series_fixture',
    Path(__file__).with_name('test_mock500_series.py'))
L = importlib.util.module_from_spec(spec); spec.loader.exec_module(L)
S = L.S


class NoPostChecks(unittest.TestCase):
    def setUp(self):
        self.f = L.SeriesChecks(); self.f.setUp(); self.addCleanup(self.f.doCleanups)
        self.first = self.f.reserve(); self.f.open().stop('UNKNOWN')
        self.original = {p.name: p.read_bytes() for p in self.f.root.iterdir() if p.name != 'lock'}
        stop = json.loads((self.f.root/'000002.json').read_bytes())
        self.p = dict(schema=S.NO_POST_SCHEMA, status='VERIFIED_NOT_DISPATCHED',
            seriesGrantSHA256=self.f.pin, targetCommit=S.FIRST, nonce=self.first['nonce'],
            reservationSHA256=S.digest(self.first), journalStopSHA256=S.digest(stop),
            externalStopSHA256=S.digest('authenticated old external stop'),
            operatorAuthoritySHA256=S.digest('actual new operator exception'),
            evidenceSHA256=S.digest('actual no-post evidence'),
            independentReviewSHA256=S.digest('independent authenticated no-post review'),
            causeSHA256=S.digest('missing state directory'), fixSHA256=S.digest('reviewed state-directory fix'),
            maximumRemainingAttempts=2, maximumRemainingStorageUSD='0.10')

    def open(self, proof=None, **options):
        p = self.p if proof is None else proof
        return self.f.open(no_post_sha256=S.digest(p), verify_no_post=lambda observed: observed == self.p,
                           **options)

    def resume(self):
        s = self.open(); s.continue_no_post(self.p); return s

    def second(self, series):
        gates = self.f.gates(S.FIRST, self.first)
        gates.update(causeSHA256=self.p['causeSHA256'], fixSHA256=self.p['fixSHA256'])
        self.f.admissions.add(S.digest(gates))
        return series.reserve(S.FIRST, str(uuid.uuid4()), gates)

    def assertOriginalsPreserved(self):
        self.assertEqual(self.original, {n:(self.f.root/n).read_bytes() for n in self.original})

    def test_single_append_preserves_stop_and_consumed_first_slot(self):
        self.f.assertBlocked(lambda: self.f.reserve())
        s = self.resume(); self.assertOriginalsPreserved()
        self.f.assertBlocked(lambda: s.require_active(self.first))
        self.f.assertBlocked(lambda: s.complete(self.first, self.f.proof(self.first)))
        second = self.second(s)
        self.assertEqual(second['ordinal'], 2); self.assertEqual(second['maximumStorageUSD'], '0.05')
        self.assertTrue(self.open().require_active(second)); self.assertOriginalsPreserved()
        self.f.assertBlocked(lambda: s.continue_no_post(self.p))
        self.f.assertBlocked(lambda: self.second(s))

    def test_only_two_slots_remain_and_next_runtime_needs_actual_fail_and_descendant_fix(self):
        s = self.resume(); second = self.second(s)
        p2 = self.f.proof(second); s.complete(second, p2)
        self.f.assertBlocked(lambda: self.second(s))
        third = self.f.reserve(s, L.SECOND, second, p2)
        self.assertEqual(third['ordinal'], 3)
        p3 = self.f.proof(third); s.complete(third, p3); s.stop('UNKNOWN')
        self.f.assertBlocked(lambda: self.f.reserve(self.open(), L.THIRD, third, p3))
        self.f.assertBlocked(lambda: s.continue_no_post(self.p)); self.assertOriginalsPreserved()

    def test_pass_unknown_unsafe_and_later_stops_never_resume(self):
        for i, changes in enumerate(({'status':'PASS'}, {'status':'UNKNOWN','runId':None,'jobId':None},
                                    {'cleanupKnown':False}, {'securityViolation':True})):
            with self.subTest(changes=changes):
                if i:
                    self.tearDown(); self.doCleanups(); self.setUp()
                s=self.resume(); second=self.second(s); p=self.f.proof(second, **changes); s.complete(second,p)
                self.f.assertBlocked(lambda:self.f.reserve(s,L.SECOND,second,p))
                s.stop('UNKNOWN'); self.f.assertBlocked(lambda:s.continue_no_post(self.p))

    def test_authentication_and_pins_are_mandatory_before_append(self):
        self.f.assertBlocked(lambda: self.f.open().continue_no_post(self.p))
        self.f.assertBlocked(lambda: self.f.open(no_post_sha256=S.digest(self.p), verify_no_post=None))
        for verifier in (lambda _:False, lambda _:1):
            s=self.f.open(no_post_sha256=S.digest(self.p),verify_no_post=verifier)
            self.f.assertBlocked(lambda:s.continue_no_post(self.p))
        def mutate(p):
            p['maximumRemainingAttempts']=3; return True
        s=self.f.open(no_post_sha256=S.digest(self.p),verify_no_post=mutate)
        self.f.assertBlocked(lambda:s.continue_no_post(dict(self.p)))
        self.assertEqual(len(list(self.f.root.glob('[0-9]*.json'))),2); self.assertOriginalsPreserved()

    def test_altered_nonce_scope_budget_and_stop_are_rejected_without_writes(self):
        changes=({'nonce':str(uuid.uuid4())},{'targetCommit':L.SECOND},{'maximumRemainingAttempts':True},
                 {'maximumRemainingAttempts':3},{'maximumRemainingStorageUSD':'0.15'},
                 {'seriesGrantSHA256':'0'*64},{'journalStopSHA256':'0'*64},{'runId':'41710000000'})
        for change in changes:
            with self.subTest(change=change):
                bad=dict(self.p,**change)
                s=self.f.open(no_post_sha256=S.digest(bad),verify_no_post=lambda _:True)
                self.f.assertBlocked(lambda:s.continue_no_post(bad))
                self.assertEqual(len(list(self.f.root.glob('[0-9]*.json'))),2)
        self.assertOriginalsPreserved()

    def test_security_stop_and_actual_terminal_are_outside_exception(self):
        stop_path=self.f.root/'000002.json'; old=json.loads(stop_path.read_bytes())
        changed=json.loads(stop_path.read_bytes()); changed['body']['reason']='SECURITY_VIOLATION'
        stop_path.write_bytes(S.canonical(changed)+b'\n')
        proof=dict(self.p,journalStopSHA256=S.digest(changed))
        s=self.f.open(no_post_sha256=S.digest(proof),verify_no_post=lambda _:True)
        self.f.assertBlocked(lambda:s.continue_no_post(proof))
        self.assertEqual(len(list(self.f.root.glob('[0-9]*.json'))),2)
        stop_path.write_bytes(S.canonical(old)+b'\n')
        self.assertOriginalsPreserved()

    def test_slot_two_requires_fresh_nonce_exact_first_runtime_and_bound_repair(self):
        s=self.resume(); gates=self.f.gates(S.FIRST,self.first)
        gates.update(causeSHA256=self.p['causeSHA256'],fixSHA256=self.p['fixSHA256'])
        for key,value in (('baseCommit',None),('priorTerminalSHA256',S.digest(self.p)),
                          ('causeSHA256','0'*64),('fixSHA256','0'*64),('targetCommit',L.SECOND)):
            bad=dict(gates,**{key:value}); self.f.admissions.add(S.digest(bad))
            self.f.assertBlocked(lambda:s.reserve(bad['targetCommit'],str(uuid.uuid4()),bad))
        self.f.admissions.add(S.digest(gates))
        self.f.assertBlocked(lambda:s.reserve(S.FIRST,self.first['nonce'],gates))
        self.second(s)

    def test_legacy_open_and_tampered_or_missing_continuation_fail_closed(self):
        self.resume(); self.f.assertBlocked(self.f.open)
        event=self.f.root/'000003.json'; original=event.read_bytes(); value=json.loads(original)
        value['body']['proof']['maximumRemainingAttempts']=3
        event.write_bytes(S.canonical(value)+b'\n'); self.f.assertBlocked(self.open)
        event.write_bytes(original); event.unlink()
        self.f.assertBlocked(lambda:self.second(self.open()))
        self.assertOriginalsPreserved()


if __name__=='__main__': unittest.main()
