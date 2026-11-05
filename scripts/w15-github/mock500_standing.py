"""Sequential Full-Mock admission under one authenticated standing instruction.

The old stopped series is immutable. This separate append-only authorization
sequence lives at the SAME trusted root; ordinals identify events, never limit
attempts. Trusted callbacks authenticate instruction, cost, actual safety/terminal
evidence and concrete repairs. Nothing here fetches links or dispatches jobs.
"""
import sys
sys.dont_write_bytecode = True
import hashlib
import importlib.util
import json
import os
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

_spec = importlib.util.spec_from_file_location('standing_admission_primitives',
                                             Path(__file__).with_name('mock500_after_stop.py'))
A = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(A)
S, need = A.S, A.need
SCHEMA = 'helmut-w15-mock500-standing/1'
GRANT = 'STANDING_MOCK500_GRANT.SAFE.json'
LEDGER, ANCHORS = 'standing-mock500-journal', 'standing-mock500-anchors'
AUTHORITY_KEYS = {'schema', 'purpose', 'actualOperatorInstruction', 'operatorObservedAtUTC',
                  'legacyBaselineSHA256', 'firstRuntimeCommit', 'maximumActualUSD',
                  'maximumModelCalls', 'productionAllowed', 'newPaidResourcesAllowed', 'stopAfterFirstPASS'}
BINDING_KEYS = A.BINDING_KEYS | {'priorTerminalSHA256', 'causeSHA256', 'fixSHA256', 'targetedTestsSHA256'}
ABANDONMENT_SCHEMA = 'helmut-w15-mock500-isolated-abandonment/1'
NEXT_BINDING_KEYS = {'nonce', 'casePath', 'runtimeCommit', 'controlCommit', 'mode', 'scope',
                     'authoritySHA256', 'approvalSHA256', 'requestSHA256',
                     'originalBindingSHA256', 'sourceQualificationSHA256'}
ABANDONMENT_KEYS = {'schema', 'status', 'claimSHA256', 'holdSHA256', 'runtimeCommit', 'nonce',
                    'runId', 'jobId', 'runProjection', 'jobStatus', 'jobConclusion',
                    'evidenceSHA256', 'operatorAuthoritySHA256', 'independentReviewSHA256', 'nextBinding'}
RUN_PROJECTION_KEYS = {'id', 'head_sha', 'event', 'head_branch', 'workflow_id', 'run_attempt',
                       'status', 'conclusion', 'created_at', 'updated_at'}


class Standing(A.AfterStop):
    def __init__(self, root, *, expected_root, baseline, authority, binding,
                 authenticate, verify_before_launch, verify_local, verify_cost,
                 verify_terminal, window_check, clock=lambda: datetime.now(timezone.utc),
                 verify_abandonment=None):
        super().__init__(root, expected_root=expected_root, baseline=baseline, authority=authority,
            binding=binding, authenticate=authenticate, verify_before_launch=verify_before_launch,
            verify_local=verify_local, window_check=window_check, clock=clock)
        self.verify_cost, self.verify_terminal = verify_cost, verify_terminal
        self.verify_abandonment = verify_abandonment

    def _authority(self):
        a = self.authority
        need(set(a) == AUTHORITY_KEYS and a['schema'] == SCHEMA + '-grant'
             and a['purpose'] == 'SEQUENTIAL_FULL_MOCK_UNTIL_FIRST_VERIFIED_PASS'
             and a['legacyBaselineSHA256'] == S.digest(self.baseline)
             and a['firstRuntimeCommit'] == A.RUNTIME and a['maximumActualUSD'] == '0.00'
             and type(a['maximumModelCalls']) is int and a['maximumModelCalls'] == 0
             and a['productionAllowed'] is False and a['newPaidResourcesAllowed'] is False
             and a['stopAfterFirstPASS'] is True
             and type(a['actualOperatorInstruction']) is str
             and 0 < len(a['actualOperatorInstruction']) <= 8192 and a['actualOperatorInstruction'].strip())
        S.utc(a['operatorObservedAtUTC'])
        before = S.canonical(a)
        need(self.authenticate(a) is True and S.canonical(a) == before)

    def _legacy(self, initialized):
        names = set(os.listdir(self.root))
        need(names == set(self.baseline['rootEntries']) | ({GRANT, LEDGER, ANCHORS} if initialized else set()))
        # Reuse the previously reviewed old-root/12-pin/5-event/2-reservation
        # validator, without calling its old grant/slot-3 authority or writers.
        baseline = json.loads(S.canonical(self.baseline))
        baseline['rootEntries'] = sorted(names)
        check = A.AfterStop(self.root, expected_root=self.expected_root, baseline=baseline,
            authority={}, binding={'nonce': self.binding['nonce']}, authenticate=None,
            verify_before_launch=None, verify_local=None, window_check=None)
        check._baseline()

    def initialize(self):
        """Explicit once-only installation after qualified standing authorization."""
        with self._locked() as fd:
            self._authority(); self._legacy(False)
            # Any crash during installation leaves a partial inventory and fails closed.
            S.Series._write(self, fd, GRANT, self.authority)
            for name in (LEDGER, ANCHORS):
                os.mkdir(name, mode=0o700, dir_fd=fd); os.fsync(fd)

    def _binding(self, value, prior, used):
        abandoned = prior is not None and 'abandonment' in prior
        need(set(value) == BINDING_KEYS | {'costProofSHA256'} | ({'priorAbandonmentSHA256'} if abandoned else set())
             and value['authoritySHA256'] == S.digest(self.authority)
             and S.commit(value['runtimeCommit']) and S.commit(value['controlCommit'])
             and value['mode'] == A.MODE and value['scope'] == A.SCOPE)
        S.identifier(value['nonce'])
        need(value['nonce'] not in used and type(value['casePath']) is str)
        for key in BINDING_KEYS | {'costProofSHA256'}:
            if key.endswith('SHA256') and key not in ('priorTerminalSHA256', 'causeSHA256', 'fixSHA256'):
                need(S.sha(value[key]))
        if prior is None:
            need(value['runtimeCommit'] == A.RUNTIME
                 and all(value[k] is None for k in ('priorTerminalSHA256', 'causeSHA256', 'fixSHA256')))
        elif abandoned:
            proof = prior['abandonment']
            need(value['priorAbandonmentSHA256'] == S.digest(proof)
                 and {k:value[k] for k in NEXT_BINDING_KEYS} == proof['nextBinding']
                 and all(value[k] is None for k in ('priorTerminalSHA256', 'causeSHA256', 'fixSHA256'))
                 and S.utc(value['issuedAtUTC']) >= S.utc(proof['runProjection']['updated_at']))
        else:
            proof, before = prior['proof'], prior['claim']['binding']
            need(proof['status'] == 'FAIL' and value['priorTerminalSHA256'] == S.digest(proof)
                 and S.sha(value['causeSHA256']) and S.sha(value['fixSHA256']))
            if proof['dispatchOutcome'] == 'ACCEPTED':
                need(value['runtimeCommit'] != before['runtimeCommit'])
            else:
                need(proof['dispatchOutcome'] == 'NOT_DISPATCHED'
                     and (value['runtimeCommit'] != before['runtimeCommit']
                          or value['controlCommit'] != before['controlCommit']))

    def _abandonment(self, proof, current):
        """One explicitly bound isolated successor; no assertion of a safe terminal."""
        need(current is not None and 'proof' not in current and 'abandonment' not in current
             and not current['abandonmentUsed'] and current['held'] and current['phase'] == 'POST'
             and current['hold']['body']['reason'] == 'UNKNOWN'
             and type(proof) is dict and set(proof) == ABANDONMENT_KEYS
             and proof['schema'] == ABANDONMENT_SCHEMA
             and proof['status'] == 'ISOLATED_ABANDONMENT_NO_SAFE_TERMINAL')
        before = current['claim']['binding']
        need(proof['claimSHA256'] == S.digest(current['claim'])
             and proof['holdSHA256'] == S.digest(current['hold'])
             and proof['runtimeCommit'] == before['runtimeCommit'] == A.RUNTIME
             and proof['nonce'] == before['nonce'])
        for key in ('evidenceSHA256', 'operatorAuthoritySHA256', 'independentReviewSHA256'):
            need(S.sha(proof[key]))
        for key in ('runId', 'jobId'):
            need(type(proof[key]) is str and re.fullmatch('[1-9][0-9]{4,19}', proof[key]) is not None)
        run = proof['runProjection']
        need(type(run) is dict and set(run) == RUN_PROJECTION_KEYS
             and type(run['id']) is int and str(run['id']) == proof['runId']
             and run['head_sha'] == proof['runtimeCommit'] and run['event'] == 'workflow_dispatch'
             and run['head_branch'] == 'codex/w15-github-end500-preparation-20261028'
             and type(run['workflow_id']) is int and run['workflow_id'] == 313506164
             and type(run['run_attempt']) is int and run['run_attempt'] == 1
             and run['status'] == proof['jobStatus'] == 'completed'
             and run['conclusion'] == proof['jobConclusion'] == 'cancelled'
             and S.utc(before['issuedAtUTC']) <= S.utc(run['created_at']) < S.utc(before['expiresAtUTC'])
             and S.utc(run['created_at']) <= S.utc(run['updated_at']))
        successor = proof['nextBinding']
        need(type(successor) is dict and set(successor) == NEXT_BINDING_KEYS
             and successor['runtimeCommit'] == before['runtimeCommit']
             and S.commit(successor['controlCommit']) and successor['controlCommit'] != before['controlCommit']
             and successor['mode'] == A.MODE and successor['scope'] == A.SCOPE
             and successor['authoritySHA256'] == S.digest(self.authority)
             and successor['nonce'] not in current['usedNonces']
             and type(successor['casePath']) is str and Path(successor['casePath']).is_absolute()
             and successor['casePath'] not in current['usedCases'])
        S.identifier(successor['nonce'])
        for key in NEXT_BINDING_KEYS:
            if key.endswith('SHA256'): need(S.sha(successor[key]))

    def _authenticate_abandonment(self, proof, current):
        before = S.canonical([proof, current, self.binding])
        need(callable(self.verify_abandonment) and self.verify_abandonment(proof, current) is True
             and S.canonical([proof, current, self.binding]) == before)

    @staticmethod
    def _can_claim(current):
        return current is None or 'abandonment' in current or 'proof' in current and current['proof']['status'] == 'FAIL'

    @staticmethod
    def _proof(proof, claim):
        need(type(proof) is dict and proof['status'] in ('PASS', 'FAIL')
             and proof['dispatchOutcome'] in ('ACCEPTED', 'NOT_DISPATCHED')
             and proof['claimSHA256'] == S.digest(claim)
             and proof['runtimeCommit'] == claim['binding']['runtimeCommit']
             and proof['nonce'] == claim['binding']['nonce']
             and all(proof[key] is True for key in ('processesStopped', 'originalIntegrityKnown',
                                                     'cleanupKnown', 'nativeZeroKnown', 'allEightCleanupPassed'))
             and proof['securityViolation'] is False and proof['actualPaidUSD'] == '0.00'
             and S.sha(proof['evidenceSHA256']))
        if proof['status'] == 'PASS':
            need(proof['dispatchOutcome'] == 'ACCEPTED' and proof['fullMock500Accepted'] is True)
        else: need(proof['fullMock500Accepted'] is False)

    def _state(self):
        self._authority(); self._legacy(True)
        need(json.loads(self._raw(self.root / GRANT)) == self.authority)
        names = None
        for directory in (LEDGER, ANCHORS):
            fd = self._directory(self.root / directory)
            try:
                current = sorted(os.listdir(fd))
                if names is None: names = current
                need(current == names)
            finally: os.close(fd)
        need(names == ['%012d.json' % i for i in range(1, len(names) + 1)])
        previous, current, prior, used = S.digest(self.authority), None, None, []
        used_cases, abandonment_used = [], False
        for sequence, name in enumerate(names, 1):
            raw = self._raw(self.root / LEDGER / name); event = json.loads(raw)
            need(raw == S.canonical(event) + b'\n'
                 and json.loads(self._raw(self.root / ANCHORS / name)) == {'eventSHA256': S.digest(event)}
                 and set(event) == {'schema', 'sequence', 'previousSHA256', 'kind', 'body'}
                 and event['schema'] == (ABANDONMENT_SCHEMA if event['kind'] == 'ISOLATED_ABANDONMENT' else SCHEMA)
                 and event['sequence'] == sequence
                 and event['previousSHA256'] == previous)
            kind, body = event['kind'], event['body']
            if kind == 'CLAIM':
                need(self._can_claim(current))
                prior = current
                need(set(body) == {'binding', 'owner'})
                self._binding(body['binding'], prior, used); used.append(body['binding']['nonce'])
                used_cases.append(body['binding']['casePath'])
                current = {'claim': body, 'phase': 'CLAIM', 'held': False,
                           'usedNonces': list(used), 'usedCases': list(used_cases), 'abandonmentUsed': abandonment_used}
            else:
                need(current is not None and 'proof' not in current and 'abandonment' not in current)
                if kind in ('LINKS', 'POST'):
                    need(not current['held'] and current['phase'] == ('CLAIM' if kind == 'LINKS' else 'LINKS')
                         and body == {'claimSHA256': S.digest(current['claim'])})
                    current['phase'] = kind
                elif kind == 'HOLD':
                    need(not current['held'] and set(body) == {'claimSHA256', 'reason'}
                         and body['claimSHA256'] == S.digest(current['claim'])
                         and body['reason'] in ('UNKNOWN', 'SECURITY_VIOLATION', 'COST_UNKNOWN'))
                    current['held'] = True
                    current['hold'] = event
                elif kind == 'ISOLATED_ABANDONMENT':
                    self._abandonment(body, current)
                    current['abandonment'] = body
                    current['abandonmentUsed'] = abandonment_used = True
                else:
                    need(kind == 'TERMINAL'); self._proof(body, current['claim'])
                    need((body['dispatchOutcome'] == 'NOT_DISPATCHED' and current['phase'] != 'POST')
                         or body['dispatchOutcome'] == 'ACCEPTED' and current['phase'] == 'POST')
                    current['proof'] = body
            previous = S.digest(event)
        return current, previous, len(names), used

    def _append(self, previous, count, kind, body):
        schema = ABANDONMENT_SCHEMA if kind == 'ISOLATED_ABANDONMENT' else SCHEMA
        event = dict(schema=schema, sequence=count + 1, previousSHA256=previous, kind=kind, body=body)
        name = '%012d.json' % (count + 1)
        # Independent permanent anchor first: truncation/partial write/missing
        # counterpart cannot silently recreate a fresh claim or another POST.
        for directory, value in ((ANCHORS, {'eventSHA256': S.digest(event)}), (LEDGER, event)):
            fd = self._directory(self.root / directory)
            try: S.Series._write(self, fd, name, value)
            finally: os.close(fd)

    def _local(self):
        now = self.clock(); b = self.binding
        issued, expires = S.utc(b['issuedAtUTC']), S.utc(b['expiresAtUTC'])
        need(type(now) is datetime and now.utcoffset() == timedelta(0)
             and S.utc(self.authority['operatorObservedAtUTC']) <= issued <= now < expires
             and expires - issued <= timedelta(hours=2))
        self.window_check(now); self._directory_check_case(b['casePath'])
        before = S.canonical(b)
        need(self.verify_local(b, now) is True and self.verify_cost(b, now) is True and S.canonical(b) == before)

    def launch(self):
        with self._locked():
            current, previous, count, used = self._state()
            need(self._can_claim(current))
            self._binding(self.binding, current, used); self._local()
            if current is not None and 'abandonment' in current:
                self._authenticate_abandonment(current['abandonment'], current)
            before = S.canonical(self.binding)
            need(self.verify_before_launch(self.binding, current) is True and S.canonical(self.binding) == before)
            self._state(); self._local()  # Repeat local state/time/cost after slow authenticated checks.
            claim = {'binding': self.binding, 'owner': A.process_identity()}
            self._append(previous, count, 'CLAIM', claim)
            return json.loads(S.canonical(claim))

    def abandon(self, proof):
        """Append the separately authenticated exception from the fresh NEXT gate."""
        with self._locked():
            current, previous, count, used = self._state()
            self._abandonment(proof, current)
            self._binding(self.binding, dict(current, abandonment=proof), used)
            self._local()
            self._authenticate_abandonment(proof, current)
            need(self._state()[0] == current)
            self._local()
            self._append(previous, count, 'ISOLATED_ABANDONMENT', proof)
            return True

    def consume(self, phase):
        with self._locked():
            current, previous, count, _ = self._state()
            need(current is not None and 'proof' not in current and not current['held']
                 and current['claim']['binding'] == self.binding and phase in ('LINKS', 'POST')
                 and current['phase'] == ('CLAIM' if phase == 'LINKS' else 'LINKS'))
            self._local(); owner = current['claim']['owner']
            need(A.process_identity(owner['pid']) == owner)
            if phase == 'POST': need(A.process_identity() == owner)
            self._append(previous, count, phase, {'claimSHA256': S.digest(current['claim'])})
            return True

    def hold(self, reason='UNKNOWN'):
        with self._locked():
            current, previous, count, _ = self._state()
            need(current is not None and 'proof' not in current and not current['held']
                 and current['claim']['binding'] == self.binding
                 and reason in ('UNKNOWN', 'SECURITY_VIOLATION', 'COST_UNKNOWN'))
            self._append(previous, count, 'HOLD', {'claimSHA256': S.digest(current['claim']), 'reason': reason})

    def complete(self, proof):
        with self._locked():
            current, previous, count, _ = self._state()
            need(current is not None and 'proof' not in current and 'abandonment' not in current
                 and current['claim']['binding'] == self.binding)
            self._proof(proof, current['claim'])
            need((proof['dispatchOutcome'] == 'NOT_DISPATCHED' and current['phase'] != 'POST')
                 or proof['dispatchOutcome'] == 'ACCEPTED' and current['phase'] == 'POST')
            before = S.canonical(proof)
            need(self.verify_terminal(proof, current['claim']) is True and S.canonical(proof) == before)
            self._append(previous, count, 'TERMINAL', proof)
            return True
