"""Private admission ledger for the operator's bounded three-run Mock500 series.

Root supplies trusted evidence verifiers and the existing real-clock window/Git
checks. A returned reservation MUST precede the unchanged child's GO/link/POST
mechanism. A lost/ambiguous reservation is never retried or released. No network,
scheduling, Original access, runner, or processing logic lives here.
Initialize explicitly once; reopen by default. Root pins the directory/grant and
verifies global attempt history and authenticated evidence in the callbacks.
"""
import sys
sys.dont_write_bytecode = True
import fcntl
import hashlib
import json
import os
from contextlib import contextmanager
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
import re
import stat
import uuid

FIRST = '789ea3ad49509d8a575a3e545333505f64e0f2ea'
SCHEMA = 'helmut-w15-mock500-series/1'
GRANT_KEYS = {'schema', 'grantId', 'operatorAuthorized', 'receivedAtUTC', 'firstCommit',
              'firstDateUTC', 'lastDateUTC', 'maximumAttempts', 'maximumPerRunUSD',
              'maximumTotalUSD', 'processingSeconds', 'completionSeconds', 'excludedNonces'}
GATE_KEYS = {'targetCommit', 'baseCommit', 'priorTerminalSHA256', 'causeSHA256', 'fixSHA256',
             'targetedTestsSHA256', 'ciRunId', 'ciProofSHA256', 'independentReviewSHA256',
             'sourceQualificationSHA256'}
TICKET_KEYS = {'schema', 'grantSHA256', 'ordinal', 'nonce', 'targetCommit', 'issuedAtUTC',
               'maximumStorageUSD', 'admissionSHA256'}
PROOF_KEYS = {'status', 'runId', 'jobId', 'exactCommit', 'nonce', 'reservationSHA256',
              'receiptSHA256', 'authenticatedInputsSHA256', 'cleanupKnown',
              'processesStopped', 'originalIntegrityKnown', 'securityViolation', 'dispatchOutcome'}


class SeriesRejected(ValueError):
    def __init__(self):
        super().__init__('MOCK500_SERIES_ADMISSION_REJECTED')


def need(ok):
    if not ok:
        raise SeriesRejected()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True,
                      allow_nan=False).encode('ascii')


def digest(value):
    return hashlib.sha256(canonical(value)).hexdigest()


def sha(value):
    return type(value) is str and re.fullmatch('[a-f0-9]{64}', value) is not None


def commit(value):
    return type(value) is str and re.fullmatch('[a-f0-9]{40}', value) is not None


def identifier(value):
    need(type(value) is str)
    parsed = uuid.UUID(value)
    need(str(parsed) == value and parsed.version == 4 and parsed.variant == uuid.RFC_4122)


def utc(value):
    need(type(value) is str)
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    need(parsed.tzinfo is not None and parsed.utcoffset().total_seconds() == 0)
    return parsed


class Series:
    def __init__(self, root, grant, expected_grant_sha256, *, window_check, is_descendant,
                 verify_admission, verify_terminal, clock=lambda: datetime.now(timezone.utc), initialize=False):
        try:
            self.root, self.grant = Path(root), json.loads(canonical(grant))
            self.pin = expected_grant_sha256
            self.window_check, self.is_descendant = window_check, is_descendant
            self.verify_admission, self.verify_terminal, self.clock = verify_admission, verify_terminal, clock
            g = self.grant
            need(type(initialize) is bool and set(g) == GRANT_KEYS and g['schema'] == SCHEMA + '-grant')
            identifier(g['grantId']); utc(g['receivedAtUTC'])
            need(g['operatorAuthorized'] is True and g['firstCommit'] == FIRST
                 and g['firstDateUTC'] == '2026-11-01' and g['lastDateUTC'] == '2026-11-07'
                 and type(g['maximumAttempts']) is int and g['maximumAttempts'] == 3
                 and g['maximumPerRunUSD'] == '0.05' and g['maximumTotalUSD'] == '0.15'
                 and type(g['processingSeconds']) is int and g['processingSeconds'] == 10800
                 and type(g['completionSeconds']) is int and g['completionSeconds'] == 12600
                 and sha(self.pin) and digest(g) == self.pin
                 and type(g['excludedNonces']) is list and len(g['excludedNonces']) <= 1000)
            for nonce in g['excludedNonces']:
                identifier(nonce)
            need(len(set(g['excludedNonces'])) == len(g['excludedNonces']))
            with self._locked() as fd:
                if initialize:
                    need(set(os.listdir(fd)) == {'lock'})
                    self._write(fd, 'GRANT.json', g)
                self._state(fd)
        except Exception:
            raise SeriesRejected() from None

    @contextmanager
    def _locked(self):
        directory = lock = None
        try:
            need(self.root.is_absolute() and '..' not in self.root.parts)
            directory = os.open(self.root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
            s = os.fstat(directory)
            need(s.st_uid == os.getuid() and stat.S_IMODE(s.st_mode) == 0o700)
            lock = os.open('lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600, dir_fd=directory)
            self._private(os.fstat(lock)); fcntl.flock(lock, fcntl.LOCK_EX)
            yield directory
        except Exception:
            raise SeriesRejected() from None
        finally:
            if lock is not None:
                os.close(lock)
            if directory is not None:
                os.close(directory)

    @staticmethod
    def _private(s):
        need(stat.S_ISREG(s.st_mode) and s.st_uid == os.getuid()
             and s.st_nlink == 1 and stat.S_IMODE(s.st_mode) == 0o600)

    def _read(self, fd, name):
        file = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=fd)
        try:
            self._private(os.fstat(file)); raw = os.read(file, 65537)
            need(0 < len(raw) <= 65536)
            value = json.loads(raw); need(raw == canonical(value) + b'\n')
            return value
        finally:
            os.close(file)

    def _write(self, fd, name, value):
        raw = canonical(value) + b'\n'; need(len(raw) <= 65536)
        file = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=fd)
        with os.fdopen(file, 'wb') as out:
            out.write(raw); out.flush(); os.fsync(out.fileno())
        os.fsync(fd)

    def _ticket(self, ticket, gates, attempts):
        need(type(ticket) is dict and set(ticket) == TICKET_KEYS and ticket['schema'] == SCHEMA + '-reservation'
             and ticket['grantSHA256'] == self.pin and ticket['ordinal'] == len(attempts) + 1
             and type(ticket['ordinal']) is int and ticket['ordinal'] <= 3
             and ticket['maximumStorageUSD'] == '0.05' and ticket['admissionSHA256'] == digest(gates))
        identifier(ticket['nonce']); day = utc(ticket['issuedAtUTC']).date().isoformat()
        need(self.grant['firstDateUTC'] <= day <= self.grant['lastDateUTC'] and commit(ticket['targetCommit'])
             and ticket['nonce'] not in self.grant['excludedNonces'] + [a['ticket']['nonce'] for a in attempts]
             and ticket['nonce'] != self.grant['grantId']
             and Decimal('0.05') * ticket['ordinal'] <= Decimal(self.grant['maximumTotalUSD']))
        need(type(gates) is dict and set(gates) == GATE_KEYS and gates['targetCommit'] == ticket['targetCommit']
             and type(gates['ciRunId']) is int and gates['ciRunId'] > 0)
        for key in ('targetedTestsSHA256', 'ciProofSHA256', 'independentReviewSHA256', 'sourceQualificationSHA256'):
            need(sha(gates[key]))
        if not attempts:
            need(ticket['targetCommit'] == FIRST and all(gates[k] is None
                 for k in ('baseCommit', 'priorTerminalSHA256', 'causeSHA256', 'fixSHA256')))
        else:
            prior = attempts[-1]; proof = prior.get('proof')
            need(proof and proof['status'] == 'FAIL' and proof['dispatchOutcome'] == 'ACCEPTED'
                 and all(proof[k] is True for k in ('cleanupKnown', 'processesStopped', 'originalIntegrityKnown'))
                 and proof['securityViolation'] is False and gates['baseCommit'] == prior['ticket']['targetCommit']
                 and gates['priorTerminalSHA256'] == digest(proof) and sha(gates['causeSHA256']) and sha(gates['fixSHA256'])
                 and ticket['targetCommit'] not in [a['ticket']['targetCommit'] for a in attempts])

    def _proof(self, proof, ticket):
        need(type(proof) is dict and set(proof) == PROOF_KEYS and proof['status'] in ('PASS', 'FAIL', 'UNKNOWN')
             and proof['exactCommit'] == ticket['targetCommit'] and proof['nonce'] == ticket['nonce']
             and proof['reservationSHA256'] == digest(ticket)
             and proof['dispatchOutcome'] in ('ACCEPTED', 'UNKNOWN', 'NOT_DISPATCHED'))
        for key in ('cleanupKnown', 'processesStopped', 'originalIntegrityKnown', 'securityViolation'):
            need(type(proof[key]) is bool)
        for key in ('runId', 'jobId'):
            need((proof['status'] == 'UNKNOWN' and proof[key] is None)
                 or type(proof[key]) is str and re.fullmatch('[1-9][0-9]{4,19}', proof[key]))
        for key in ('receiptSHA256', 'authenticatedInputsSHA256'):
            need(sha(proof[key]))

    def _state(self, fd):
        need(self._read(fd, 'GRANT.json') == self.grant)
        names = sorted(set(os.listdir(fd)) - {'lock', 'GRANT.json'})
        need(len(names) <= 7 and names == [f'{i:06d}.json' for i in range(1, len(names) + 1)])
        attempts, previous, closed = [], self.pin, False
        for i, name in enumerate(names, 1):
            event = self._read(fd, name)
            need(set(event) == {'schema', 'sequence', 'previousSHA256', 'kind', 'body'}
                 and event['schema'] == SCHEMA and type(event['sequence']) is int
                 and event['sequence'] == i and event['previousSHA256'] == previous)
            body = event['body']; need(not closed and type(body) is dict)
            if event['kind'] == 'RESERVE':
                need(set(body) == {'ticket', 'gates'} and (not attempts or 'proof' in attempts[-1]))
                self._ticket(body['ticket'], body['gates'], attempts); attempts.append(body)
            elif event['kind'] == 'TERMINAL':
                need(set(body) == {'proof'} and attempts and 'proof' not in attempts[-1])
                self._proof(body['proof'], attempts[-1]['ticket']); attempts[-1]['proof'] = body['proof']
            else:
                need(event['kind'] == 'STOP' and set(body) == {'reason'}
                     and body['reason'] in ('PASS', 'UNKNOWN', 'SECURITY_VIOLATION')); closed = True
            previous = digest(event)
        return attempts, previous, len(names), closed

    def _append(self, fd, previous, count, kind, body):
        self._write(fd, f'{count + 1:06d}.json', dict(schema=SCHEMA, sequence=count + 1,
                    previousSHA256=previous, kind=kind, body=body))

    def reserve(self, target_commit, nonce, gates):
        with self._locked() as fd:
            attempts, previous, count, closed = self._state(fd); need(not closed)
            now = self.clock(); need(isinstance(now, datetime) and now.tzinfo is not None)
            need(now >= utc(self.grant['receivedAtUTC'])); self.window_check(now)
            ticket = dict(schema=SCHEMA + '-reservation', grantSHA256=self.pin, ordinal=len(attempts) + 1,
                          nonce=nonce, targetCommit=target_commit, issuedAtUTC=now.astimezone(timezone.utc).isoformat(),
                          maximumStorageUSD='0.05', admissionSHA256=digest(gates))
            self._ticket(ticket, gates, attempts)
            if attempts:
                need(self.is_descendant(attempts[-1]['ticket']['targetCommit'], target_commit) is True)
            need(self.verify_admission(ticket, gates) is True)
            self._append(fd, previous, count, 'RESERVE', dict(ticket=ticket, gates=gates))
            return json.loads(canonical(ticket))

    def complete(self, ticket, proof):
        with self._locked() as fd:
            attempts, previous, count, closed = self._state(fd)
            need(not closed and attempts and 'proof' not in attempts[-1] and attempts[-1]['ticket'] == ticket)
            self._proof(proof, ticket); need(self.verify_terminal(ticket, proof) is True)
            self._append(fd, previous, count, 'TERMINAL', dict(proof=proof))

    def require_active(self, ticket):
        with self._locked() as fd:
            attempts, _, _, closed = self._state(fd)
            need(not closed and attempts and 'proof' not in attempts[-1] and attempts[-1]['ticket'] == ticket)
            return True

    def stop(self, reason):
        with self._locked() as fd:
            _, previous, count, closed = self._state(fd)
            need(not closed and reason in ('PASS', 'UNKNOWN', 'SECURITY_VIOLATION'))
            self._append(fd, previous, count, 'STOP', dict(reason=reason))
