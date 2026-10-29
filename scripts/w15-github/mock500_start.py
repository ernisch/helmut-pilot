"""Closed one-shot Mock500 admission and original-clock safety guards.

No CLI or work on import. A passing preparation check grants no execution
authority; the separately reviewed workflow must supply its concrete owner GO.
"""
import sys
sys.dont_write_bytecode = True

from datetime import datetime, timedelta, timezone
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import time
import uuid
from zoneinfo import ZoneInfo

SPEC = importlib.util.spec_from_file_location('w15_mock_start_resources', Path(__file__).with_name('mock500_resources.py'))
R = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(R)
BASELINE_COMMIT = '7e3d96e99fc687b03bcb9a7cbe4a0f59c174859b'
BRANCH = 'refs/heads/codex/w15-github-end500-preparation-20261028'
MODE = 'mock500-full-gated'
LIMITS = {'comparisonBudgetBytes': R.LIMIT, 'maximumConsumptionBytes': R.MAXIMUM,
          'requiredReserveBytes': R.RESERVE, 'swapBytes': 0}
FINGERPRINT = '7E3998A6C2CB948C69A2EE51F4267ABF26796EDC'
INPUT_SHA = 'af3bd654fa292ad256e0fa265c2fb3d968e945633f1439a12da72f015aeab86f'
SHA = re.compile('[a-f0-9]{64}\\Z')
HEX = re.compile('[a-f0-9]{40}\\Z')


class StartRejected(RuntimeError):
    pass


def need(value, code='MOCK500_START_ADMISSION_REJECTED'):
    if not value:
        raise StartRejected(code)


def _utc(value):
    need(isinstance(value, str) and re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?Z', value))
    return datetime.fromisoformat(value.replace('Z', '+00:00'))


def _record(envelope):
    need(isinstance(envelope, dict) and set(envelope) == {'raw', 'sha256'}
         and isinstance(envelope['raw'], str) and 0 < len(envelope['raw'].encode()) <= 65536
         and isinstance(envelope['sha256'], str) and SHA.fullmatch(envelope['sha256']))
    raw = envelope['raw'].encode('utf-8')
    need(hashlib.sha256(raw).hexdigest() == envelope['sha256'])
    def unique(rows):
        result = {}
        for key, value in rows:
            need(key not in result)
            result[key] = value
        return result
    value = json.loads(raw, object_pairs_hook=unique,
        parse_constant=lambda _: (_ for _ in ()).throw(StartRejected('MOCK500_START_ADMISSION_REJECTED')))
    need(isinstance(value, dict))
    return value


def validate_admission(request, end500_acceptance, *, compatibility_bridge, observed_context,
                       expected_end500_commit=BASELINE_COMMIT, now=None):
    """Bind a prior independently accepted frozen End500 to new Mock-only code.

    The owner approval intentionally has no runId. Only the fresh observed
    context binds the actual GitHub run id to its approved nonce and commit.
    Record envelopes preserve their actual reviewed bytes and SHA256.
    """
    need(isinstance(expected_end500_commit, str) and HEX.fullmatch(expected_end500_commit))
    need(isinstance(request, dict) and request.get('mode') == MODE
         and request.get('branch') == BRANCH and isinstance(request.get('exactCommit'), str)
         and HEX.fullmatch(request['exactCommit']) and request['exactCommit'] != expected_end500_commit
         and type(request.get('runAttempt')) is int and request['runAttempt'] == 1
         and request.get('limits') == LIMITS and all(type(v) is int for v in request['limits'].values())
         and isinstance(request.get('sourceQualificationSHA256'), str)
         and SHA.fullmatch(request['sourceQualificationSHA256']))
    nonce = uuid.UUID(request['nonce'])
    need(str(nonce) == request['nonce'] and nonce.version == 4 and nonce.variant == uuid.RFC_4122)
    need(isinstance(observed_context, dict) and set(observed_context) == {
        'mode', 'branch', 'exactCommit', 'runId', 'runAttempt', 'nonce'}
         and all(observed_context[k] == request[k] for k in ('mode', 'branch', 'exactCommit', 'runAttempt', 'nonce'))
         and isinstance(observed_context['runId'], str) and re.fullmatch('[1-9][0-9]{4,19}', observed_context['runId'])
         and type(observed_context['runAttempt']) is int)
    end500, bridge = _record(end500_acceptance), _record(compatibility_bridge)
    need(end500.get('schema') == 'helmut-w15-independent-end500-acceptance/1'
         and end500.get('scope') == 'ISOLATED_GITHUB_END500_ONLY'
         and end500.get('status') == 'PASS_INDEPENDENT_GITHUB_END500_ACCEPTANCE'
         and end500.get('exactCommit') == expected_end500_commit
         and isinstance(end500.get('runId'), str) and re.fullmatch('[1-9][0-9]{4,19}', end500['runId'])
         and end500['runId'] != observed_context['runId']
         and type(end500.get('runAttempt')) is int and end500['runAttempt'] == 1
         and isinstance(end500.get('receiptSHA256'), str) and SHA.fullmatch(end500['receiptSHA256'])
         and end500.get('resourceContract') == 'helmut-w15-end500-memory-check/3'
         and end500.get('commonLifetimeMemoryAccepted') is True
         and end500.get('completeBackupAccepted') is True
         and end500.get('independentRestoreAccepted') is True
         and type(end500.get('profiles')) is int and end500['profiles'] == 500
         and type(end500.get('activeProfiles')) is int and end500['activeProfiles'] == 0
         and end500.get('inputManifestSHA') == INPUT_SHA and end500.get('recipientFingerprint') == FINGERPRINT
         and end500.get('productionAcceptance') is False and end500.get('mock500Acceptance') is False
         and end500.get('executionAuthority') is False, 'MOCK500_POSITIVE_FROZEN_END500_ACCEPTANCE_REQUIRED')
    need(bridge.get('schema') == 'helmut-w15-mock500-baseline-bridge/1'
         and bridge.get('status') == 'PASS_INDEPENDENT_BASELINE_COMPATIBILITY_REVIEW'
         and bridge.get('baselineExactCommit') == expected_end500_commit
         and bridge.get('mockExactCommit') == request['exactCommit']
         and bridge.get('sourceQualificationSHA256') == request['sourceQualificationSHA256']
         and bridge.get('end500AcceptanceSHA256') == end500_acceptance['sha256']
         and bridge.get('inputManifestSHA') == INPUT_SHA and bridge.get('recipientFingerprint') == FINGERPRINT
         and bridge.get('end500CodeReexecuted') is False
         and bridge.get('mockMemoryContract') == R.PROFILE
         and bridge.get('executionAuthority') is False, 'MOCK500_REVIEWED_BASELINE_BRIDGE_REQUIRED')
    approval = request.get('approval')
    keys = {'schema', 'scope', 'authorized', 'mode', 'exactCommit', 'branch', 'runAttempt', 'nonce',
        'sourceQualificationSHA256', 'end500AcceptanceSHA256', 'compatibilitySHA256', 'limits',
        'processingSeconds', 'completionSeconds', 'expectedProfiles', 'expectedUnits',
        'expectedPositions', 'expectedControls', 'maxProviderCalls', 'maxStorageUSD',
        'maxReceiveAttempts', 'issuedAt', 'expiresAt'}
    need(isinstance(approval, dict) and set(approval) == keys
         and approval['schema'] == 'helmut-w15-mock500-start-approval/1'
         and approval['scope'] == 'ISOLATED_GITHUB_MOCK500_ONLY' and approval['authorized'] is True
         and all(approval[k] == request[k] for k in ('mode', 'exactCommit', 'branch', 'runAttempt',
             'nonce', 'sourceQualificationSHA256', 'limits'))
         and approval['end500AcceptanceSHA256'] == end500_acceptance['sha256']
         and approval['compatibilitySHA256'] == compatibility_bridge['sha256']
         and approval['maxStorageUSD'] == '0.05', 'MOCK500_SEPARATE_EXPLICIT_GO_REQUIRED')
    exact = {'processingSeconds': 10800, 'completionSeconds': 12600, 'expectedProfiles': 500,
        'expectedUnits': 500, 'expectedPositions': 1500, 'expectedControls': 8000,
        'maxProviderCalls': 0, 'maxReceiveAttempts': 1, 'runAttempt': 1}
    need(all(type(approval[k]) is int and approval[k] == v for k, v in exact.items())
         and all(type(v) is int for v in approval['limits'].values()))
    issued, expires = _utc(approval['issuedAt']), _utc(approval['expiresAt'])
    now = datetime.now(timezone.utc) if now is None else now
    need(isinstance(now, datetime) and now.tzinfo is not None and issued <= now < expires
         and 0 < (expires - issued).total_seconds() <= 7200, 'MOCK500_APPROVAL_START_WINDOW_EXPIRED')
    return {'status': 'PASS_SEPARATE_MOCK500_ADMISSION_BINDINGS_ONLY',
        'runId': observed_context['runId'], 'exactCommit': request['exactCommit'],
        'sourceQualificationSHA256': request['sourceQualificationSHA256'],
        'end500AcceptanceSHA256': end500_acceptance['sha256'], 'compatibilitySHA256': compatibility_bridge['sha256'],
        'end500BaselineCommit': expected_end500_commit, 'memoryProfile': R.PROFILE,
        'executionAuthority': False, 'mock500Acceptance': False}


class StartGuard:
    def __init__(self, context, approval, end500_acceptance, resources, *, compatibility_bridge,
                 observed_context, started_at, started_monotonic,
                 expected_end500_commit=BASELINE_COMMIT, now=None):
        request = {**{k: observed_context[k] for k in ('mode', 'branch', 'exactCommit', 'runAttempt', 'nonce')},
            'sourceQualificationSHA256': approval['sourceQualificationSHA256'], 'limits': LIMITS, 'approval': approval}
        self.admission = validate_admission(request, end500_acceptance,
            compatibility_bridge=compatibility_bridge, observed_context=observed_context,
            expected_end500_commit=expected_end500_commit, now=now)
        need(context.get('schema') == 'helmut-w15-mock500-controller-context/1' and context.get('scope') == R.SCOPE
             and all(context[k] == observed_context[k] for k in ('exactCommit', 'runId', 'runAttempt', 'nonce'))
             and getattr(resources, 'profile', None) == R.PROFILE)
        now = datetime.now(timezone.utc) if now is None else now
        need(isinstance(started_at, datetime) and started_at.tzinfo is not None and started_at <= now
             and type(started_monotonic) in (int, float) and 0 <= started_monotonic <= time.monotonic())
        self.started_at, self.started_monotonic = started_at.astimezone(timezone.utc), started_monotonic
        self.processing_deadline = self.started_at + timedelta(seconds=10800)
        self.completion_deadline = self.started_at + timedelta(seconds=12600)
        berlin = ZoneInfo('Europe/Berlin')
        need('2026-10-28' <= self.started_at.date().isoformat() <= '2026-10-31'
             and self.started_at.date() == self.completion_deadline.date()
             and self.started_at.astimezone(berlin).date() == self.completion_deadline.astimezone(berlin).date(),
             'MOCK500_EXISTING_UTC_BERLIN_RUN_WINDOW_UNAVAILABLE')
        self.context, self.resources = json.loads(json.dumps(context)), resources
        self.resources.check_context(context)
        self.failure = None
        self.before_dispatch(now=now)

    @property
    def window(self):
        def iso(value):
            return value.isoformat(timespec='milliseconds').replace('+00:00', 'Z')
        return {'startsAtUTC': iso(self.started_at + timedelta(milliseconds=1)),
                'endsAtUTC': iso(self.processing_deadline),
                'completionDeadlineUTC': iso(self.completion_deadline)}

    def _check(self, closure, now):
        now = datetime.now(timezone.utc) if now is None else now
        need(isinstance(now, datetime) and now.tzinfo is not None)
        elapsed = time.monotonic() - self.started_monotonic
        maximum = 12600 if closure else 10800
        try:
            need(0 <= elapsed < maximum and now < (self.completion_deadline if closure else self.processing_deadline),
                 'MOCK500_ORIGINAL_CLOCK_DEADLINE')
            sample = R.assess(self.resources.check_context(self.context))
            need(self.failure is None or closure, 'MOCK500_FIRST_FAILURE_BLOCKS_DISPATCH')
            return sample
        except (Exception, KeyboardInterrupt):
            self.failure = self.failure or 'MOCK500_SAFETY_GUARD_FAILED'
            raise

    def before_dispatch(self, *, kind='unit', now=None):
        need(kind in ('unit', 'auth', 'provider', 'prepare'))
        # "provider" denotes the existing isolated mock provider boundary.
        # Admission grants zero external/model calls for every kind.
        return self._check(False, now)

    def closure_guard(self, *, now=None):
        return self._check(True, now)

    def observe_duration(self, kind, milliseconds):
        limits = {'auth': 30000, 'unit': 60000, 'provider': 20000}
        if not (kind in limits and type(milliseconds) in (int, float)
                and 0 <= milliseconds < limits[kind]):
            self.failure = self.failure or 'MOCK500_NATIVE_DURATION_LIMIT'
            raise StartRejected('MOCK500_NATIVE_DURATION_LIMIT')
        return milliseconds


def plan():
    return {'status': 'BLOCKED_SEPARATE_MOCK500_GO_AND_POSITIVE_END500_ACCEPTANCE_REQUIRED',
        'historicalMockFailure': R.HISTORICAL_FAILURE, 'memoryProfile': R.PROFILE,
        'limits': LIMITS, 'processingSeconds': 10800, 'completionSeconds': 12600,
        'profiles': 500, 'units': 500, 'controls': 8000, 'positions': 1500,
        'providerCalls': 0, 'executionAuthority': False, 'mock500Acceptance': False}
