"""Validate an authenticated manual binding to the existing bounded Mock500 series.

Trusted root supplies authenticate: it must verify the immutable actual operator
source, never an API/environment flag. Root still checks the real-clock window,
fresh global nonce, existing journal, exact-head qualification and all old gates.
This pure validator creates no authority, reservation, retry, refresh or scheduler
record. It returns only True; errors contain no supplied/private values.
"""
import sys
sys.dont_write_bytecode = True
from collections.abc import Callable
from datetime import datetime, timedelta
import hashlib
import json
import re
import uuid

FIRST = '789ea3ad49509d8a575a3e545333505f64e0f2ea'
AUTHORITY_SCHEMA = 'helmut-w15-mock500-manual-authority/1'
PROOF_SCHEMA = 'helmut-w15-mock500-manual-binding/1'
SCOPE = 'ISOLATED_GITHUB_MOCK500_HOST_FUNCTIONAL_ONLY'
AUTHORITY_KEYS = {'schema', 'scope', 'environment', 'seriesGrantSHA256', 'firstCommit',
                  'maximumAttempts', 'maximumPerRunUSD', 'maximumTotalUSD', 'maximumModelUSD',
                  'actualOperatorInstruction', 'operatorObservedAtUTC', 'explicitManualStart',
                  'codexThreadId', 'runtimeEnvironmentId', 'cloudEnvironmentId'}
PROOF_KEYS = {'schema', 'status', 'mode', 'seriesGrantSHA256', 'authoritySHA256',
              'controlCommit', 'targetCommit', 'nonce', 'ordinal', 'codexThreadId',
              'runtimeEnvironmentId', 'cloudEnvironmentId', 'issuedAtUTC', 'expiresAtUTC',
              'maximumAttempts', 'automaticRetry', 'linkRefresh'}


class ManualBindingRejected(ValueError):
    def __init__(self):
        super().__init__('MOCK500_MANUAL_BINDING_REJECTED')


def need(ok):
    if not ok:
        raise ManualBindingRejected()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True,
                      allow_nan=False).encode('ascii')


def digest(value):
    return hashlib.sha256(canonical(value)).hexdigest()


def _hex(value, size):
    return type(value) is str and re.fullmatch('[a-f0-9]{' + str(size) + '}', value) is not None


def _context(value):
    return type(value) is str and re.fullmatch('[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}', value) is not None


def _utc(value):
    need(type(value) is str and re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ', value))
    return datetime.fromisoformat(value.replace('Z', '+00:00'))


def validate_manual_binding(proof: dict, *, authority: dict, expected_authority_sha256: str,
                            series_grant_sha256: str, control_commit: str, target_commit: str,
                            nonce: str, ordinal: int, thread_id: str,
                            runtime_environment_id: str, cloud_environment_id: str,
                            now: datetime, authenticate: Callable[[dict], bool]) -> bool:
    """Require literal trusted-source authentication in addition to all typed bindings."""
    try:
        need(type(authority) is dict and set(authority) == AUTHORITY_KEYS
             and type(proof) is dict and set(proof) == PROOF_KEYS)
        raw, proof_raw = canonical(authority), canonical(proof)
        need(_hex(expected_authority_sha256, 64) and _hex(series_grant_sha256, 64)
             and hashlib.sha256(raw).hexdigest() == expected_authority_sha256)
        need(callable(authenticate) and authenticate(authority) is True
             and canonical(authority) == raw and canonical(proof) == proof_raw)
        a, p = json.loads(raw), json.loads(proof_raw)
        need(all(type(p[key]) is str for key in PROOF_KEYS
                 - {'ordinal', 'maximumAttempts', 'automaticRetry', 'linkRefresh'}))
        need(a['schema'] == AUTHORITY_SCHEMA and a['scope'] == SCOPE
             and a['environment'] == 'helmut-ci-originals' and a['explicitManualStart'] is True
             and a['seriesGrantSHA256'] == series_grant_sha256 and a['firstCommit'] == FIRST
             and type(a['maximumAttempts']) is int and a['maximumAttempts'] == 3
             and a['maximumPerRunUSD'] == '0.05' and a['maximumTotalUSD'] == '0.15'
             and a['maximumModelUSD'] == '0.00'
             and type(a['actualOperatorInstruction']) is str
             and 0 < len(a['actualOperatorInstruction']) <= 8192 and a['actualOperatorInstruction'].strip())
        need(p['schema'] == PROOF_SCHEMA and p['status'] == 'AUTHENTICATED_MANUAL_START_BINDING'
             and p['mode'] == 'MANUAL' and p['authoritySHA256'] == expected_authority_sha256
             and p['seriesGrantSHA256'] == series_grant_sha256
             and _hex(control_commit, 40) and p['controlCommit'] == control_commit
             and _hex(target_commit, 40) and p['targetCommit'] == target_commit
             and type(ordinal) is int and 1 <= ordinal <= 3
             and type(p['ordinal']) is int and p['ordinal'] == ordinal
             and type(p['maximumAttempts']) is int and p['maximumAttempts'] == 1
             and p['automaticRetry'] is False and p['linkRefresh'] is False)
        need(type(nonce) is str and type(p['nonce']) is str and p['nonce'] == nonce)
        parsed = uuid.UUID(nonce)
        need(str(parsed) == nonce and parsed.version == 4 and parsed.variant == uuid.RFC_4122)
        for key, expected in (('codexThreadId', thread_id), ('runtimeEnvironmentId', runtime_environment_id),
                              ('cloudEnvironmentId', cloud_environment_id)):
            need(_context(expected) and type(a[key]) is str and type(p[key]) is str
                 and a[key] == p[key] == expected)
        issued, expires, observed = _utc(p['issuedAtUTC']), _utc(p['expiresAtUTC']), _utc(a['operatorObservedAtUTC'])
        need(type(now) is datetime and now.tzinfo is not None and now.utcoffset() == timedelta(0)
             and observed <= issued <= now < expires and expires - issued <= timedelta(seconds=7200))
        return True
    except Exception:
        raise ManualBindingRejected() from None
