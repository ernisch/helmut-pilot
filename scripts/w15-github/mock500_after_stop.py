"""One consumed slot 3 beside an immutable, stopped Mock500 series.

Trusted root pins the *existing* root, baseline and actual new operator instruction.
The child cannot select those pins. Authentication/qualification and complete
GitHub history run before launch/READY; links and POST only repeat local checks.
No initializer, refund, retry, series append, network or processing lives here.
"""
import sys
sys.dont_write_bytecode = True
import fcntl
import hashlib
import importlib.util
import json
import os
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
import stat

_spec = importlib.util.spec_from_file_location('after_stop_series_primitives',
                                             Path(__file__).with_name('mock500_series.py'))
S = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(S)
RUNTIME = '33d588b6209ad912c5045f6561c07b7dc3d60e63'
MODE = 'mock500-full-host-functional-gated'
SCOPE = 'ISOLATED_GITHUB_MOCK500_HOST_FUNCTIONAL_ONLY'
SCHEMA = 'helmut-w15-mock500-after-stop/1'
FILES = tuple('SLOT3_AFTER_STOP_' + p + '.SAFE.json' for p in ('CLAIM', 'LINKS', 'POST', 'CLOSED'))
SPENT = 'SLOT3_AFTER_STOP_SPENT.SAFE.json'
PIN_NAMES = {'INITIALIZED.SAFE.json', 'OPERATOR_SERIES_GRANT.SAFE.json',
             'SERIES_STOP.SAFE.json', 'NO_POST_LATER_STOP.SAFE.json', 'journal/GRANT.json',
             *('journal/%06d.json' % i for i in range(1, 6)),
             'reservations/000001.json', 'reservations/000002.json'}
BINDING_KEYS = {'runtimeCommit', 'controlCommit', 'nonce', 'casePath', 'mode', 'scope',
                'authoritySHA256', 'approvalSHA256', 'requestSHA256', 'originalBindingSHA256',
                'sourceQualificationSHA256', 'controlQualificationSHA256', 'reviewSHA256',
                'issuedAtUTC', 'expiresAtUTC'}
AUTHORITY_KEYS = {'schema', 'purpose', 'actualOperatorInstruction', 'operatorObservedAtUTC',
                  'seriesBaselineSHA256', 'runtimeCommit', 'controlCommit', 'nonce', 'casePath',
                  'approvalSHA256', 'requestSHA256', 'scope', 'environment', 'ordinal',
                  'maximumAttempts', 'maximumLinkRounds', 'maximumPerRunUSD', 'maximumTotalUSD',
                  'maximumModelCalls', 'preservePriorStopsAndUnknown', 'automaticRetry', 'linkRefresh'}


class AfterStopRejected(ValueError):
    def __init__(self):
        super().__init__('MOCK500_AFTER_STOP_REJECTED')


def need(value):
    if not value:
        raise AfterStopRejected()


def process_identity(pid=None):
    pid = os.getpid() if pid is None else pid
    # Linux start ticks disambiguate PID reuse without a resumable child token.
    fields = Path('/proc/%d/stat' % pid).read_text().rsplit(')', 1)[1].split()
    need(fields[0] not in ('Z', 'X'))
    return {'pid': pid, 'startTicks': fields[19]}


def authenticate_history(api, received_at, expected):
    """Complete authenticated manual history, including separately authorized diagnostics."""
    keys = {'id', 'head_sha', 'event', 'head_branch', 'workflow_id', 'run_attempt',
            'status', 'conclusion', 'created_at', 'updated_at'}
    found, seen, previous = [], set(), None
    since = S.utc(received_at)
    need(type(expected) is list and all(set(row) == keys for row in expected))
    for page in range(1, 21):
        rows = api('GET', '/actions/runs?event=workflow_dispatch&per_page=100&page=' + str(page))['workflow_runs']
        need(type(rows) is list and len(rows) <= 100)
        for row in rows:
            created = S.utc(row['created_at'])
            need(row['event'] == 'workflow_dispatch' and row['status'] == 'completed'
                 and row['id'] not in seen and (previous is None or created <= previous))
            seen.add(row['id']); previous = created
            if created >= since: found.append({key: row[key] for key in keys})
        if len(rows) < 100 or previous < since:
            need(sorted(found, key=lambda row: row['id']) == sorted(expected, key=lambda row: row['id']))
            return True
    raise AfterStopRejected()


class AfterStop:
    def __init__(self, root, *, expected_root, baseline, authority, binding,
                 authenticate, verify_before_launch, verify_local, window_check,
                 clock=lambda: datetime.now(timezone.utc)):
        self.root = Path(root)
        self.expected_root = expected_root
        self.baseline, self.authority, self.binding = (json.loads(S.canonical(v))
                                                      for v in (baseline, authority, binding))
        self.authenticate, self.verify_before_launch = authenticate, verify_before_launch
        self.verify_local, self.window_check, self.clock = verify_local, window_check, clock

    @staticmethod
    def _directory(path):
        need(path.is_absolute() and str(path.resolve(strict=True)) == str(path))
        fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            info = os.fstat(fd)
            need(info.st_uid == os.getuid() and stat.S_IMODE(info.st_mode) == 0o700)
            return fd
        except BaseException:
            os.close(fd); raise

    @staticmethod
    def _raw(path):
        need(str(path.resolve(strict=True)) == str(path))
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        try:
            S.Series._private(os.fstat(fd)); raw = os.read(fd, 1048577)
            need(0 < len(raw) <= 1048576)
            return raw
        finally:
            os.close(fd)

    @contextmanager
    def _locked(self):
        directory = lock = None
        try:
            need(str(self.root) == self.expected_root)
            directory = self._directory(self.root)
            # Existing shared lock only: missing state must never initialize anything.
            journal = self._directory(self.root / 'journal')
            try:
                lock = os.open('lock', os.O_RDWR | os.O_NOFOLLOW, dir_fd=journal)
                S.Series._private(os.fstat(lock)); fcntl.flock(lock, fcntl.LOCK_EX)
            finally:
                os.close(journal)
            yield directory
        except Exception:
            raise AfterStopRejected() from None
        finally:
            if lock is not None: os.close(lock)
            if directory is not None: os.close(directory)

    def _baseline(self):
        base = self.baseline
        need(set(base) == {'rootEntries', 'files', 'history'} and type(base['files']) is list)
        need({p['relativePath'] for p in base['files']} == PIN_NAMES and len(base['files']) == len(PIN_NAMES))
        names = set(os.listdir(self.root))
        allowed = {*FILES, SPENT}
        need(names - allowed == set(base['rootEntries']) and not allowed & set(base['rootEntries']))
        need(set(os.listdir(self.root / 'journal')) == {'lock', 'GRANT.json', *('%06d.json' % i for i in range(1, 6))})
        for subdir, expected in (('reservations', {'000001.json', '000002.json'}), ('terminals', set())):
            fd = self._directory(self.root / subdir)
            try: need(set(os.listdir(fd)) == expected)
            finally: os.close(fd)
        values = {}
        for pin in base['files']:
            need(set(pin) == {'relativePath', 'bytes', 'sha256'} and S.sha(pin['sha256']))
            raw = self._raw(self.root / pin['relativePath'])
            need(len(raw) == pin['bytes'] and hashlib.sha256(raw).hexdigest() == pin['sha256'])
            values[pin['relativePath']] = json.loads(raw)
        grant = values['OPERATOR_SERIES_GRANT.SAFE.json']
        need(grant == values['journal/GRANT.json'] and grant['maximumAttempts'] == 3
             and grant['maximumPerRunUSD'] == '0.05' and grant['maximumTotalUSD'] == '0.15')
        rows = [values['journal/%06d.json' % i] for i in range(1, 6)]
        need([r['kind'] for r in rows] == ['RESERVE', 'STOP', 'NO_POST_CONTINUATION', 'RESERVE', 'STOP'])
        previous = S.digest(grant)
        for i, row in enumerate(rows, 1):
            need(row['sequence'] == i and row['previousSHA256'] == previous)
            previous = S.digest(row)
        need(rows[1]['body'] == rows[4]['body'] == {'reason': 'UNKNOWN'})
        for name in ('SERIES_STOP.SAFE.json', 'NO_POST_LATER_STOP.SAFE.json'):
            need(values[name]['reason'] == 'UNKNOWN' and values[name]['grantSHA256'] == S.digest(grant))
        old = [rows[i]['body']['ticket'] for i in (0, 3)]
        for i, ticket in enumerate(old, 1):
            anchor = values['reservations/%06d.json' % i]
            need(ticket['ordinal'] == anchor['ordinal'] == i and anchor['reservationSHA256'] == S.digest(ticket))
        need(self.binding['nonce'] not in [t['nonce'] for t in old] + grant['excludedNonces'] + [grant['grantId']])
        return grant

    def _check(self):
        b, a = self.binding, self.authority
        need(set(b) == BINDING_KEYS and set(a) == AUTHORITY_KEYS)
        for key in BINDING_KEYS:
            if key.endswith('SHA256'): need(S.sha(b[key]))
        S.identifier(b['nonce'])
        need(b['runtimeCommit'] == RUNTIME and S.commit(b['controlCommit'])
             and b['controlCommit'] != RUNTIME and b['mode'] == MODE and b['scope'] == SCOPE)
        self._directory_check_case(b['casePath'])
        grant = self._baseline()
        need(a['schema'] == SCHEMA + '-authority' and a['purpose'] == 'EXECUTE_ONE_FULL_MOCK_AFTER_STOP'
             and a['seriesBaselineSHA256'] == S.digest(self.baseline)
             and a['scope'] == SCOPE and a['environment'] == 'helmut-ci-originals'
             and type(a['actualOperatorInstruction']) is str and 0 < len(a['actualOperatorInstruction']) <= 8192
             and a['actualOperatorInstruction'].strip()
             and type(a['ordinal']) is int and a['ordinal'] == 3
             and type(a['maximumAttempts']) is int and a['maximumAttempts'] == 1
             and type(a['maximumLinkRounds']) is int and a['maximumLinkRounds'] == 1
             and a['maximumPerRunUSD'] == '0.05' and a['maximumTotalUSD'] == '0.15'
             and type(a['maximumModelCalls']) is int and a['maximumModelCalls'] == 0
             and a['preservePriorStopsAndUnknown'] is True
             and a['automaticRetry'] is False and a['linkRefresh'] is False)
        for key in ('runtimeCommit', 'controlCommit', 'nonce', 'casePath', 'approvalSHA256', 'requestSHA256'):
            need(a[key] == b[key])
        now, issued, expires = self.clock(), S.utc(b['issuedAtUTC']), S.utc(b['expiresAtUTC'])
        need(type(now) is datetime and now.utcoffset() == timedelta(0)
             and S.utc(grant['receivedAtUTC']) <= S.utc(a['operatorObservedAtUTC']) <= issued <= now < expires
             and expires - issued <= timedelta(hours=2))
        self.window_check(now)
        before = S.canonical(a)
        need(S.digest(a) == b['authoritySHA256'] and self.authenticate(a) is True and S.canonical(a) == before)
        before = S.canonical(b)
        need(self.verify_local(b, now) is True and S.canonical(b) == before)

    @classmethod
    def _directory_check_case(cls, value):
        need(type(value) is str)
        fd = cls._directory(Path(value)); os.close(fd)

    def _read(self, index):
        raw = self._raw(self.root / FILES[index]); value = json.loads(raw)
        need(raw == S.canonical(value) + b'\n')
        return value

    def _write(self, fd, index, value):
        # Failure during write/fsync still leaves an exclusive global marker: no refund.
        S.Series._write(self, fd, FILES[index], value)

    def _state(self):
        present = [os.path.lexists(self.root / name) for name in FILES]
        need(present[:3] in ([False, False, False], [True, False, False], [True, True, False], [True, True, True]))
        need(not present[3])
        if present[0]:
            claim = self._read(0)
            need(set(claim) == {'schema', 'bindingSHA256', 'baselineSHA256', 'owner', 'ordinal', 'maximumStorageUSD'}
                 and claim['schema'] == SCHEMA and claim['bindingSHA256'] == S.digest(self.binding)
                 and claim['baselineSHA256'] == S.digest(self.baseline)
                 and claim['ordinal'] == 3 and claim['maximumStorageUSD'] == '0.05')
            need(json.loads(self._raw(self.root / SPENT)) == {'claimSHA256': S.digest(claim), 'ordinal': 3})
            for i in (1, 2):
                if present[i]: need(self._read(i) == {'claimSHA256': S.digest(claim), 'phase': ('LINKS', 'POST')[i - 1]})
            return sum(present), claim
        need(not os.path.lexists(self.root / SPENT))
        return 0, None

    def launch(self):
        with self._locked() as fd:
            self._check(); count, _ = self._state(); need(count == 0)
            before = S.canonical(self.binding)
            need(self.verify_before_launch(self.binding, self.baseline['history']) is True
                 and S.canonical(self.binding) == before)
            self._check()  # Real clock and immutable state after slow authenticated preflight.
            claim = dict(schema=SCHEMA, bindingSHA256=S.digest(self.binding), baselineSHA256=S.digest(self.baseline),
                         owner=process_identity(), ordinal=3, maximumStorageUSD='0.05')
            S.Series._write(self, fd, SPENT, {'claimSHA256': S.digest(claim), 'ordinal': 3})
            self._write(fd, 0, claim)
            return claim

    def consume(self, phase):
        with self._locked() as fd:
            self._check(); count, claim = self._state()
            need(phase in ('LINKS', 'POST') and count == (1 if phase == 'LINKS' else 2))
            need(process_identity(claim['owner']['pid']) == claim['owner'])
            if phase == 'POST': need(process_identity() == claim['owner'])
            self._write(fd, count, {'claimSHA256': S.digest(claim), 'phase': phase})
            return True

    def close(self, status, *, proof=None, verify_terminal=None):
        """Close regardless of expiry/drift. It never asserts a safe actual terminal."""
        with self._locked() as fd:
            need(status in ('PASS', 'FAIL', 'UNKNOWN', 'SECURITY_VIOLATION'))
            count, claim = self._state(); need(count > 0)
            if status in ('PASS', 'FAIL'):
                before = S.canonical(proof)
                need(count == 3 and type(proof) is dict and proof['status'] == status
                     and proof['runtimeCommit'] == RUNTIME and proof['nonce'] == self.binding['nonce']
                     and proof['claimSHA256'] == S.digest(claim) and callable(verify_terminal)
                     and verify_terminal(proof) is True and S.canonical(proof) == before)
            else: need(proof is None)
            self._write(fd, 3, {'claimSHA256': S.digest(claim), 'status': status,
                               'proofSHA256': S.digest(proof) if proof is not None else None, 'retryAllowed': False})
            return True
